package query

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"
)

var (
	ErrQueryNotFound = errors.New("query not found")
	ErrQueryPending  = errors.New("query pending")
)

type Limits struct {
	Timeout  time.Duration
	PageSize int
	MaxRows  int
}

type Column struct {
	Name         string `json:"name"`
	DatabaseType string `json:"databaseType,omitempty"`
}

type ResultPage struct {
	QueryID      string   `json:"queryId"`
	Columns      []Column `json:"columns,omitempty"`
	Rows         [][]any  `json:"rows,omitempty"`
	NextCursor   int      `json:"nextCursor,omitempty"`
	AffectedRows int64    `json:"affectedRows,omitempty"`
	DurationMS   int64    `json:"durationMs"`
	Truncated    bool     `json:"truncated,omitempty"`
}

type job struct {
	scope        string
	cancel       context.CancelFunc
	done         chan struct{}
	columns      []Column
	rows         [][]any
	affectedRows int64
	duration     time.Duration
	truncated    bool
	err          error
}

type Service struct {
	mu     sync.RWMutex
	limits Limits
	jobs   map[string]*job
}

func NewService(limits Limits) *Service {
	if limits.Timeout <= 0 {
		limits.Timeout = 30 * time.Second
	}
	if limits.PageSize <= 0 {
		limits.PageSize = 200
	}
	if limits.MaxRows <= 0 {
		limits.MaxRows = 10_000
	}
	return &Service{limits: limits, jobs: make(map[string]*job)}
}

func (s *Service) Start(scope string, database *sql.DB, statement string) string {
	ctx, cancel := context.WithTimeout(context.Background(), s.limits.Timeout)
	id := opaqueID()
	item := &job{scope: scope, cancel: cancel, done: make(chan struct{})}
	s.mu.Lock()
	s.jobs[id] = item
	s.mu.Unlock()
	go s.run(ctx, item, database, statement)
	return id
}

func (s *Service) run(ctx context.Context, item *job, database *sql.DB, statement string) {
	started := time.Now()
	defer func() { item.duration = time.Since(started); item.cancel(); close(item.done) }()
	if !returnsRows(statement) {
		result, err := database.ExecContext(ctx, statement)
		if err != nil {
			item.err = queryError(ctx, err)
			return
		}
		item.affectedRows, item.err = result.RowsAffected()
		return
	}
	rows, err := database.QueryContext(ctx, statement)
	if err != nil {
		item.err = queryError(ctx, err)
		return
	}
	defer rows.Close()
	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		item.err = err
		return
	}
	item.columns = make([]Column, len(columnTypes))
	for i, column := range columnTypes {
		item.columns[i] = Column{Name: column.Name(), DatabaseType: column.DatabaseTypeName()}
	}
	for rows.Next() {
		if len(item.rows) >= s.limits.MaxRows {
			item.truncated = true
			break
		}
		values := make([]any, len(columnTypes))
		pointers := make([]any, len(values))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			item.err = err
			return
		}
		for i, value := range values {
			values[i] = normalizeCell(value)
		}
		item.rows = append(item.rows, values)
	}
	if err := rows.Err(); err != nil {
		item.err = queryError(ctx, err)
	}
}

func (s *Service) Result(scope, queryID string, cursor int) (ResultPage, error) {
	s.mu.RLock()
	item, ok := s.jobs[queryID]
	s.mu.RUnlock()
	if !ok || item.scope != scope {
		return ResultPage{}, ErrQueryNotFound
	}
	select {
	case <-item.done:
	default:
		return ResultPage{}, ErrQueryPending
	}
	if item.err != nil {
		return ResultPage{}, item.err
	}
	if cursor < 0 || cursor > len(item.rows) {
		return ResultPage{}, fmt.Errorf("invalid result cursor")
	}
	end := cursor + s.limits.PageSize
	if end > len(item.rows) {
		end = len(item.rows)
	}
	next := 0
	if end < len(item.rows) {
		next = end
	}
	return ResultPage{QueryID: queryID, Columns: item.columns, Rows: item.rows[cursor:end], NextCursor: next, AffectedRows: item.affectedRows, DurationMS: item.duration.Milliseconds(), Truncated: item.truncated}, nil
}

func (s *Service) Cancel(scope, queryID string) error {
	s.mu.RLock()
	item, ok := s.jobs[queryID]
	s.mu.RUnlock()
	if !ok || item.scope != scope {
		return ErrQueryNotFound
	}
	item.cancel()
	return nil
}

func (s *Service) ExportCSV(scope, queryID string, output io.Writer) error {
	s.mu.RLock()
	item, ok := s.jobs[queryID]
	s.mu.RUnlock()
	if !ok || item.scope != scope {
		return ErrQueryNotFound
	}
	select {
	case <-item.done:
	default:
		return ErrQueryPending
	}
	if item.err != nil {
		return item.err
	}
	if _, err := io.WriteString(output, "\ufeff"); err != nil {
		return err
	}
	writer := csv.NewWriter(output)
	writer.UseCRLF = true
	headings := make([]string, len(item.columns))
	for i, column := range item.columns {
		headings[i] = column.Name
	}
	if err := writer.Write(headings); err != nil {
		return err
	}
	for _, row := range item.rows {
		record := make([]string, len(row))
		for i, value := range row {
			if value != nil {
				record[i] = fmt.Sprint(value)
			}
		}
		if err := writer.Write(record); err != nil {
			return err
		}
	}
	writer.Flush()
	return writer.Error()
}

func returnsRows(statement string) bool {
	tokens := tokenize(statement)
	if len(tokens) == 0 {
		return false
	}
	switch strings.ToUpper(tokens[0].text) {
	case "SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "VALUES":
		return true
	default:
		return false
	}
}

func queryError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}

func normalizeCell(value any) any {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	case time.Time:
		return typed.UTC().Format(time.RFC3339Nano)
	default:
		return value
	}
}

func opaqueID() string {
	value := make([]byte, 24)
	if _, err := rand.Read(value); err != nil {
		panic("cryptographic random source unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(value)
}
