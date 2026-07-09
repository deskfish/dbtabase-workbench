package logs

import (
	"bufio"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"dbworkbench/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultBucketSizeMs int64 = 60_000

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
	ErrInvalid   = errors.New("invalid")
)

type Store struct {
	pool      *pgxpool.Pool
	uploadDir string
}

type Session struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	Scope        string    `json:"scope"`
	OwnerUserID  string    `json:"ownerUserId,omitempty"`
	TeamID       string    `json:"teamId,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	FileCount    int       `json:"fileCount"`
	ServiceCount int       `json:"serviceCount"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
}

type SourceFile struct {
	ID           string `json:"id"`
	SessionID    string `json:"sessionId"`
	ServiceName  string `json:"serviceName"`
	NodeName     string `json:"nodeName"`
	OriginalName string `json:"originalName"`
	TotalLines   int    `json:"totalLines"`
	ParseStatus  string `json:"parseStatus"`
	SourceType   string `json:"sourceType"`
}

type Entry struct {
	ID           int64  `json:"id"`
	SessionID    string `json:"sessionId"`
	SourceFileID string `json:"sourceFileId"`
	TimestampMs  *int64 `json:"timestampMs"`
	Level        string `json:"level"`
	ServiceName  string `json:"serviceName"`
	NodeName     string `json:"nodeName"`
	Message      string `json:"message"`
	Raw          string `json:"raw"`
	LineNumber   int    `json:"lineNumber"`
}

type NodeScope struct {
	NodeName  string `json:"nodeName"`
	LineCount int64  `json:"lineCount"`
}

type ServiceScope struct {
	ServiceName string      `json:"serviceName"`
	LineCount   int64       `json:"lineCount"`
	Nodes       []NodeScope `json:"nodes"`
}

type TimeBucket struct {
	BucketStartMs int64 `json:"bucketStartMs"`
	Count         int   `json:"count"`
	ErrorCount    int   `json:"errorCount"`
}

type CreateSessionInput struct {
	Name   string
	Scope  string
	TeamID string
}

type AddFileInput struct {
	OriginalName string
	ServiceName  string
	NodeName     string
	SourceType   string
	Reader       io.Reader
}

type CreateTailFileInput struct {
	RemotePath  string
	ServiceName string
	NodeName    string
}

type SearchInput struct {
	Query      string
	Levels     []string
	Services   []string
	NodeKeys   []string
	TimeFromMs *int64
	TimeToMs   *int64
	Limit      int
}

type SearchResult struct {
	Entries    []Entry        `json:"entries"`
	Total      int            `json:"total"`
	CountExact bool           `json:"countExact"`
	Tree       []ServiceScope `json:"tree"`
}

type parsedLine struct {
	TimestampMs *int64
	Level       string
	Message     string
}

type entryRow struct {
	timestampMs *int64
	level       string
	message     string
	raw         string
	lineNumber  int
}

func NewStore(pool *pgxpool.Pool, uploadDir string) *Store {
	return &Store{pool: pool, uploadDir: uploadDir}
}

func (s *Store) ListSessions(ctx context.Context, actor identity.Principal) ([]Session, error) {
	if actor.User.Disabled {
		return nil, ErrForbidden
	}
	rows, err := s.pool.Query(ctx, `
		SELECT s.id, s.name, s.status, s.scope, COALESCE(s.owner_user_id, ''), COALESCE(s.team_id, ''),
		       s.created_at, s.updated_at, COALESCE(s.error_message, ''),
		       COUNT(DISTINCT f.id)::int AS file_count,
		       COUNT(DISTINCT f.service_name)::int AS service_count
		FROM log_sessions s
		LEFT JOIN log_source_files f ON f.session_id = s.id
		WHERE (
			(s.scope = 'personal' AND s.owner_user_id = $1)
			OR
			(s.scope = 'team' AND ($2 OR EXISTS (
				SELECT 1 FROM team_members
				WHERE team_members.team_id = s.team_id
				  AND team_members.user_id = $1
			)))
		)
		GROUP BY s.id
		ORDER BY s.updated_at DESC, s.created_at DESC`, actor.User.ID, isSystemAdmin(actor))
	if err != nil {
		return nil, fmt.Errorf("list log sessions: %w", err)
	}
	defer rows.Close()
	var sessions []Session
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list log sessions: %w", err)
	}
	return sessions, nil
}

func (s *Store) CreateSession(ctx context.Context, actor identity.Principal, input CreateSessionInput) (Session, error) {
	if actor.User.Disabled {
		return Session{}, ErrForbidden
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = "日志分析 " + time.Now().Format("2006-01-02 15:04")
	}
	scope := strings.TrimSpace(input.Scope)
	if scope == "" {
		scope = "personal"
	}
	teamID := strings.TrimSpace(input.TeamID)
	ownerUserID := ""
	switch scope {
	case "personal":
		ownerUserID = actor.User.ID
		teamID = ""
	case "team":
		if teamID == "" {
			return Session{}, ErrInvalid
		}
		if !isSystemAdmin(actor) && actor.Teams[teamID] != "admin" {
			return Session{}, ErrForbidden
		}
	default:
		return Session{}, ErrInvalid
	}
	id, err := newID("logs_")
	if err != nil {
		return Session{}, err
	}
	session, err := scanSession(s.pool.QueryRow(ctx, `
		INSERT INTO log_sessions (id, name, status, scope, owner_user_id, team_id, created_by)
		VALUES ($1, $2, 'pending', $3, NULLIF($4, ''), NULLIF($5, ''), $6)
		RETURNING id, name, status, scope, COALESCE(owner_user_id, ''), COALESCE(team_id, ''),
		          created_at, updated_at, COALESCE(error_message, ''), 0::int, 0::int`,
		id, name, scope, ownerUserID, teamID, actor.User.ID,
	))
	if err != nil {
		return Session{}, fmt.Errorf("create log session: %w", err)
	}
	return session, nil
}

func (s *Store) AddFile(ctx context.Context, actor identity.Principal, sessionID string, input AddFileInput) (SourceFile, error) {
	session, err := s.authorize(ctx, actor, sessionID, true)
	if err != nil {
		return SourceFile{}, err
	}
	if input.Reader == nil {
		return SourceFile{}, ErrInvalid
	}
	originalName := strings.TrimSpace(input.OriginalName)
	if originalName == "" {
		originalName = "uploaded.log"
	}
	serviceName := strings.TrimSpace(input.ServiceName)
	nodeName := strings.TrimSpace(input.NodeName)
	if serviceName == "" || nodeName == "" {
		inferredService, inferredNode := InferServiceNode(originalName)
		if serviceName == "" {
			serviceName = inferredService
		}
		if nodeName == "" {
			nodeName = inferredNode
		}
	}
	sourceType := strings.TrimSpace(input.SourceType)
	if sourceType == "" {
		sourceType = "local"
	}
	fileID, err := newID("logfile_")
	if err != nil {
		return SourceFile{}, err
	}
	storagePath, err := s.saveUpload(session.ID, fileID, originalName, input.Reader)
	if err != nil {
		return SourceFile{}, err
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO log_source_files (id, session_id, service_name, node_name, original_name, storage_path, parse_status, source_type)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
		fileID, session.ID, serviceName, nodeName, originalName, storagePath, sourceType,
	)
	if err != nil {
		return SourceFile{}, fmt.Errorf("create log source file: %w", err)
	}
	if _, err := s.pool.Exec(ctx, "UPDATE log_sessions SET status = 'indexing', updated_at = now(), error_message = NULL WHERE id = $1", session.ID); err != nil {
		return SourceFile{}, fmt.Errorf("mark log session indexing: %w", err)
	}
	totalLines, indexErr := s.indexFile(ctx, session.ID, fileID, storagePath, serviceName, nodeName)
	if indexErr != nil {
		_, _ = s.pool.Exec(ctx, "UPDATE log_source_files SET parse_status = 'failed' WHERE id = $1", fileID)
		_, _ = s.pool.Exec(ctx, "UPDATE log_sessions SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1", session.ID, indexErr.Error())
		return SourceFile{}, indexErr
	}
	if _, err := s.pool.Exec(ctx, "UPDATE log_source_files SET parse_status = 'done', total_lines = $2 WHERE id = $1", fileID, totalLines); err != nil {
		return SourceFile{}, fmt.Errorf("complete log source file: %w", err)
	}
	if _, err := s.pool.Exec(ctx, "UPDATE log_sessions SET status = 'ready', updated_at = now(), error_message = NULL WHERE id = $1", session.ID); err != nil {
		return SourceFile{}, fmt.Errorf("complete log indexing: %w", err)
	}
	return SourceFile{
		ID:           fileID,
		SessionID:    session.ID,
		ServiceName:  serviceName,
		NodeName:     nodeName,
		OriginalName: originalName,
		TotalLines:   totalLines,
		ParseStatus:  "done",
		SourceType:   sourceType,
	}, nil
}

func (s *Store) CreateTailFile(ctx context.Context, actor identity.Principal, sessionID string, input CreateTailFileInput) (SourceFile, error) {
	session, err := s.authorize(ctx, actor, sessionID, true)
	if err != nil {
		return SourceFile{}, err
	}
	remotePath := strings.TrimSpace(input.RemotePath)
	if remotePath == "" || !strings.HasPrefix(remotePath, "/") || strings.ContainsRune(remotePath, 0) {
		return SourceFile{}, ErrInvalid
	}
	originalName := path.Base(remotePath)
	if originalName == "." || originalName == "/" {
		originalName = "remote.log"
	}
	serviceName := strings.TrimSpace(input.ServiceName)
	nodeName := strings.TrimSpace(input.NodeName)
	if serviceName == "" || nodeName == "" {
		inferredService, inferredNode := InferServiceNode(originalName)
		if serviceName == "" {
			serviceName = inferredService
		}
		if nodeName == "" {
			nodeName = inferredNode
		}
	}
	fileID, err := newID("logfile_")
	if err != nil {
		return SourceFile{}, err
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO log_source_files (id, session_id, service_name, node_name, original_name, storage_path, parse_status, source_type)
		VALUES ($1, $2, $3, $4, $5, $6, 'done', 'ssh_tail')`,
		fileID, session.ID, serviceName, nodeName, originalName, remotePath,
	); err != nil {
		return SourceFile{}, fmt.Errorf("create remote log source file: %w", err)
	}
	if _, err := s.pool.Exec(ctx, "UPDATE log_sessions SET status = 'ready', updated_at = now(), error_message = NULL WHERE id = $1", session.ID); err != nil {
		return SourceFile{}, fmt.Errorf("mark remote log session ready: %w", err)
	}
	return SourceFile{
		ID:           fileID,
		SessionID:    session.ID,
		ServiceName:  serviceName,
		NodeName:     nodeName,
		OriginalName: originalName,
		ParseStatus:  "done",
		SourceType:   "ssh_tail",
	}, nil
}

func (s *Store) AppendTailLine(ctx context.Context, actor identity.Principal, sessionID, sourceFileID, raw string) (Entry, error) {
	session, err := s.authorize(ctx, actor, sessionID, true)
	if err != nil {
		return Entry{}, err
	}
	raw = strings.TrimRight(raw, "\r\n")
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Entry{}, fmt.Errorf("begin append tail line: %w", err)
	}
	defer tx.Rollback(ctx)

	var serviceName, nodeName string
	var currentLines int
	if err := tx.QueryRow(ctx, `
		SELECT service_name, node_name, total_lines
		FROM log_source_files
		WHERE id = $1 AND session_id = $2
		FOR UPDATE`, sourceFileID, session.ID).Scan(&serviceName, &nodeName, &currentLines); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Entry{}, ErrNotFound
		}
		return Entry{}, fmt.Errorf("load remote log source file: %w", err)
	}
	var previous sql.NullInt64
	err = tx.QueryRow(ctx, `
		SELECT timestamp_ms
		FROM log_entries
		WHERE session_id = $1 AND source_file_id = $2
		ORDER BY line_number DESC
		LIMIT 1`, session.ID, sourceFileID).Scan(&previous)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, fmt.Errorf("load previous tail timestamp: %w", err)
	}
	var previousPtr *int64
	if previous.Valid {
		value := previous.Int64
		previousPtr = &value
	}
	parsed := ParseLogLine(raw, previousPtr)
	message := parsed.Message
	if message == "" {
		message = raw
	}
	lineNumber := currentLines + 1
	var entry Entry
	entry.SessionID = session.ID
	entry.SourceFileID = sourceFileID
	entry.TimestampMs = parsed.TimestampMs
	entry.Level = parsed.Level
	entry.ServiceName = serviceName
	entry.NodeName = nodeName
	entry.Message = message
	entry.Raw = raw
	entry.LineNumber = lineNumber
	if err := tx.QueryRow(ctx, `
		INSERT INTO log_entries (session_id, source_file_id, timestamp_ms, level, service_name, node_name, message, raw, line_number)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id`,
		session.ID, sourceFileID, parsed.TimestampMs, parsed.Level, serviceName, nodeName, message, raw, lineNumber,
	).Scan(&entry.ID); err != nil {
		return Entry{}, fmt.Errorf("insert tail log entry: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE log_source_files
		SET total_lines = total_lines + 1, parse_status = 'done'
		WHERE id = $1`, sourceFileID); err != nil {
		return Entry{}, fmt.Errorf("update remote log source file: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO log_scope_stats (session_id, service_name, node_name, line_count)
		VALUES ($1, $2, $3, 1)
		ON CONFLICT (session_id, service_name, node_name) DO UPDATE
		SET line_count = log_scope_stats.line_count + 1`,
		session.ID, serviceName, nodeName); err != nil {
		return Entry{}, fmt.Errorf("update tail log scope stats: %w", err)
	}
	if parsed.TimestampMs != nil {
		bucketStart := (*parsed.TimestampMs / defaultBucketSizeMs) * defaultBucketSizeMs
		errorCount := 0
		if parsed.Level == "ERROR" {
			errorCount = 1
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO log_time_buckets (session_id, bucket_start_ms, bucket_size_ms, count, error_count)
			VALUES ($1, $2, $3, 1, $4)
			ON CONFLICT (session_id, bucket_start_ms, bucket_size_ms) DO UPDATE SET
			  count = log_time_buckets.count + 1,
			  error_count = log_time_buckets.error_count + EXCLUDED.error_count`,
			session.ID, bucketStart, defaultBucketSizeMs, errorCount); err != nil {
			return Entry{}, fmt.Errorf("update tail log time bucket: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, "UPDATE log_sessions SET status = 'ready', updated_at = now(), error_message = NULL WHERE id = $1", session.ID); err != nil {
		return Entry{}, fmt.Errorf("update tail log session: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Entry{}, fmt.Errorf("commit append tail line: %w", err)
	}
	return entry, nil
}

func (s *Store) Search(ctx context.Context, actor identity.Principal, sessionID string, input SearchInput) (SearchResult, error) {
	if _, err := s.authorize(ctx, actor, sessionID, false); err != nil {
		return SearchResult{}, err
	}
	where, args := buildSearchWhere(sessionID, input)
	countQuery := "SELECT COUNT(*)::int FROM log_entries WHERE " + strings.Join(where, " AND ")
	var total int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return SearchResult{}, fmt.Errorf("count log entries: %w", err)
	}
	limit := input.Limit
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	args = append(args, limit)
	rows, err := s.pool.Query(ctx, `
		SELECT id, session_id, source_file_id, timestamp_ms, level, service_name, node_name, message, raw, line_number
		FROM log_entries
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY timestamp_ms NULLS LAST, id
		LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return SearchResult{}, fmt.Errorf("search log entries: %w", err)
	}
	defer rows.Close()
	var entries []Entry
	for rows.Next() {
		entry, err := scanEntry(rows)
		if err != nil {
			return SearchResult{}, err
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return SearchResult{}, fmt.Errorf("search log entries: %w", err)
	}
	tree, err := s.Tree(ctx, actor, sessionID)
	if err != nil {
		return SearchResult{}, err
	}
	return SearchResult{Entries: entries, Total: total, CountExact: true, Tree: tree}, nil
}

func (s *Store) Files(ctx context.Context, actor identity.Principal, sessionID string) ([]SourceFile, error) {
	if _, err := s.authorize(ctx, actor, sessionID, false); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, session_id, service_name, node_name, original_name, total_lines, parse_status, source_type
		FROM log_source_files
		WHERE session_id = $1
		ORDER BY service_name, node_name, original_name`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("list log files: %w", err)
	}
	defer rows.Close()
	var files []SourceFile
	for rows.Next() {
		var file SourceFile
		if err := rows.Scan(&file.ID, &file.SessionID, &file.ServiceName, &file.NodeName, &file.OriginalName, &file.TotalLines, &file.ParseStatus, &file.SourceType); err != nil {
			return nil, fmt.Errorf("scan log file: %w", err)
		}
		files = append(files, file)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list log files: %w", err)
	}
	return files, nil
}

func (s *Store) Tree(ctx context.Context, actor identity.Principal, sessionID string) ([]ServiceScope, error) {
	if _, err := s.authorize(ctx, actor, sessionID, false); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT service_name, node_name, line_count
		FROM log_scope_stats
		WHERE session_id = $1
		ORDER BY lower(service_name), lower(node_name)`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("load log scope tree: %w", err)
	}
	defer rows.Close()
	services := map[string]*ServiceScope{}
	var order []string
	for rows.Next() {
		var serviceName, nodeName string
		var lineCount int64
		if err := rows.Scan(&serviceName, &nodeName, &lineCount); err != nil {
			return nil, fmt.Errorf("scan log scope tree: %w", err)
		}
		service := services[serviceName]
		if service == nil {
			service = &ServiceScope{ServiceName: serviceName}
			services[serviceName] = service
			order = append(order, serviceName)
		}
		service.LineCount += lineCount
		service.Nodes = append(service.Nodes, NodeScope{NodeName: nodeName, LineCount: lineCount})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load log scope tree: %w", err)
	}
	result := make([]ServiceScope, 0, len(order))
	for _, key := range order {
		result = append(result, *services[key])
	}
	return result, nil
}

func (s *Store) Timeline(ctx context.Context, actor identity.Principal, sessionID string, bucketSizeMs int64) ([]TimeBucket, error) {
	if _, err := s.authorize(ctx, actor, sessionID, false); err != nil {
		return nil, err
	}
	if bucketSizeMs <= 0 {
		bucketSizeMs = defaultBucketSizeMs
	}
	rows, err := s.pool.Query(ctx, `
		SELECT bucket_start_ms, count, error_count
		FROM log_time_buckets
		WHERE session_id = $1 AND bucket_size_ms = $2
		ORDER BY bucket_start_ms`, sessionID, bucketSizeMs)
	if err != nil {
		return nil, fmt.Errorf("load log timeline: %w", err)
	}
	defer rows.Close()
	var buckets []TimeBucket
	for rows.Next() {
		var bucket TimeBucket
		if err := rows.Scan(&bucket.BucketStartMs, &bucket.Count, &bucket.ErrorCount); err != nil {
			return nil, fmt.Errorf("scan log timeline: %w", err)
		}
		buckets = append(buckets, bucket)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load log timeline: %w", err)
	}
	return buckets, nil
}

func (s *Store) DeleteSession(ctx context.Context, actor identity.Principal, sessionID string) error {
	if _, err := s.authorize(ctx, actor, sessionID, true); err != nil {
		return err
	}
	result, err := s.pool.Exec(ctx, "DELETE FROM log_sessions WHERE id = $1", sessionID)
	if err != nil {
		return fmt.Errorf("delete log session: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) saveUpload(sessionID, fileID, originalName string, reader io.Reader) (string, error) {
	if s.uploadDir == "" {
		return "", errors.New("log upload dir is required")
	}
	dir := filepath.Join(s.uploadDir, safePathPart(sessionID))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create upload dir: %w", err)
	}
	path := filepath.Join(dir, safePathPart(fileID)+"-"+safePathPart(originalName))
	file, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("create upload file: %w", err)
	}
	defer file.Close()
	if _, err := io.Copy(file, reader); err != nil {
		return "", fmt.Errorf("write upload file: %w", err)
	}
	return path, nil
}

func (s *Store) indexFile(ctx context.Context, sessionID, sourceFileID, path, serviceName, nodeName string) (int, error) {
	file, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("open uploaded log file: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 10*1024*1024)
	lineNumber := 0
	var lastTimestamp *int64
	var batch []entryRow
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		rows := make([][]any, 0, len(batch))
		bucketDeltas := map[int64]struct {
			count      int
			errorCount int
		}{}
		for _, row := range batch {
			var timestamp any
			if row.timestampMs == nil {
				timestamp = nil
			} else {
				timestamp = *row.timestampMs
				bucketStart := (*row.timestampMs / defaultBucketSizeMs) * defaultBucketSizeMs
				delta := bucketDeltas[bucketStart]
				delta.count++
				if row.level == "ERROR" {
					delta.errorCount++
				}
				bucketDeltas[bucketStart] = delta
			}
			rows = append(rows, []any{
				sessionID,
				sourceFileID,
				timestamp,
				row.level,
				serviceName,
				nodeName,
				row.message,
				row.raw,
				row.lineNumber,
			})
		}
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin log batch: %w", err)
		}
		defer tx.Rollback(ctx)
		if _, err := tx.CopyFrom(ctx,
			pgx.Identifier{"log_entries"},
			[]string{"session_id", "source_file_id", "timestamp_ms", "level", "service_name", "node_name", "message", "raw", "line_number"},
			pgx.CopyFromRows(rows),
		); err != nil {
			return fmt.Errorf("copy log entries: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO log_scope_stats (session_id, service_name, node_name, line_count)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (session_id, service_name, node_name) DO UPDATE
			SET line_count = log_scope_stats.line_count + EXCLUDED.line_count`,
			sessionID, serviceName, nodeName, len(batch),
		); err != nil {
			return fmt.Errorf("update log scope stats: %w", err)
		}
		for bucketStart, delta := range bucketDeltas {
			if _, err := tx.Exec(ctx, `
				INSERT INTO log_time_buckets (session_id, bucket_start_ms, bucket_size_ms, count, error_count)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (session_id, bucket_start_ms, bucket_size_ms) DO UPDATE SET
				  count = log_time_buckets.count + EXCLUDED.count,
				  error_count = log_time_buckets.error_count + EXCLUDED.error_count`,
				sessionID, bucketStart, defaultBucketSizeMs, delta.count, delta.errorCount,
			); err != nil {
				return fmt.Errorf("update log time buckets: %w", err)
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit log batch: %w", err)
		}
		batch = batch[:0]
		return nil
	}
	for scanner.Scan() {
		raw := scanner.Text()
		lineNumber++
		parsed := ParseLogLine(raw, lastTimestamp)
		if parsed.TimestampMs != nil {
			value := *parsed.TimestampMs
			lastTimestamp = &value
		}
		message := parsed.Message
		if message == "" {
			message = raw
		}
		batch = append(batch, entryRow{
			timestampMs: parsed.TimestampMs,
			level:       parsed.Level,
			message:     message,
			raw:         raw,
			lineNumber:  lineNumber,
		})
		if len(batch) >= 5000 {
			if err := flush(); err != nil {
				return lineNumber, err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return lineNumber, fmt.Errorf("scan uploaded log file: %w", err)
	}
	if err := flush(); err != nil {
		return lineNumber, err
	}
	return lineNumber, nil
}

func (s *Store) authorize(ctx context.Context, actor identity.Principal, sessionID string, write bool) (Session, error) {
	if actor.User.Disabled {
		return Session{}, ErrForbidden
	}
	session, err := s.loadSession(ctx, sessionID)
	if err != nil {
		return Session{}, err
	}
	switch session.Scope {
	case "personal":
		if session.OwnerUserID == actor.User.ID {
			return session, nil
		}
		return Session{}, ErrNotFound
	case "team":
		if isSystemAdmin(actor) {
			return session, nil
		}
		role := actor.Teams[session.TeamID]
		if write {
			if role == "admin" {
				return session, nil
			}
			return Session{}, ErrForbidden
		}
		if role != "" {
			return session, nil
		}
		return Session{}, ErrForbidden
	default:
		return Session{}, ErrForbidden
	}
}

func (s *Store) loadSession(ctx context.Context, sessionID string) (Session, error) {
	session, err := scanSession(s.pool.QueryRow(ctx, `
		SELECT s.id, s.name, s.status, s.scope, COALESCE(s.owner_user_id, ''), COALESCE(s.team_id, ''),
		       s.created_at, s.updated_at, COALESCE(s.error_message, ''),
		       (SELECT COUNT(*)::int FROM log_source_files f WHERE f.session_id = s.id),
		       (SELECT COUNT(DISTINCT service_name)::int FROM log_source_files f WHERE f.session_id = s.id)
		FROM log_sessions s
		WHERE s.id = $1`, sessionID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("load log session: %w", err)
	}
	return session, nil
}

func buildSearchWhere(sessionID string, input SearchInput) ([]string, []any) {
	where := []string{"session_id = $1"}
	args := []any{sessionID}
	add := func(sql string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(sql, len(args)))
	}
	query := strings.TrimSpace(input.Query)
	if query != "" {
		args = append(args, query)
		where = append(where, fmt.Sprintf("(message ILIKE '%%' || $%d || '%%' OR raw ILIKE '%%' || $%d || '%%')", len(args), len(args)))
	}
	levels := normalizeList(input.Levels)
	if len(levels) > 0 {
		add("level = ANY($%d)", levels)
	}
	services := normalizeList(input.Services)
	if len(services) > 0 {
		add("service_name = ANY($%d)", services)
	}
	nodeKeys := normalizeList(input.NodeKeys)
	if len(nodeKeys) > 0 {
		pairs := make([]string, 0, len(nodeKeys))
		for _, key := range nodeKeys {
			pairs = append(pairs, strings.ReplaceAll(key, "\x00", "/"))
		}
		add("(service_name || '/' || node_name) = ANY($%d)", pairs)
	}
	if input.TimeFromMs != nil {
		add("timestamp_ms >= $%d", *input.TimeFromMs)
	}
	if input.TimeToMs != nil {
		add("timestamp_ms <= $%d", *input.TimeToMs)
	}
	return where, args
}

func normalizeList(values []string) []string {
	seen := map[string]bool{}
	var result []string
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func scanSession(row pgx.Row) (Session, error) {
	var session Session
	if err := row.Scan(
		&session.ID,
		&session.Name,
		&session.Status,
		&session.Scope,
		&session.OwnerUserID,
		&session.TeamID,
		&session.CreatedAt,
		&session.UpdatedAt,
		&session.ErrorMessage,
		&session.FileCount,
		&session.ServiceCount,
	); err != nil {
		return Session{}, err
	}
	return session, nil
}

func scanEntry(rows pgx.Rows) (Entry, error) {
	var entry Entry
	var timestamp *int64
	if err := rows.Scan(
		&entry.ID,
		&entry.SessionID,
		&entry.SourceFileID,
		&timestamp,
		&entry.Level,
		&entry.ServiceName,
		&entry.NodeName,
		&entry.Message,
		&entry.Raw,
		&entry.LineNumber,
	); err != nil {
		return Entry{}, fmt.Errorf("scan log entry: %w", err)
	}
	entry.TimestampMs = timestamp
	return entry, nil
}

var (
	springBracketPattern = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)\s+\[[^\]]+\]\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+`)
	springPattern        = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+`)
	isoPattern           = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)`)
	nginxPattern         = regexp.MustCompile(`\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]`)
)

func ParseLogLine(line string, lastTimestampMs *int64) parsedLine {
	trimmed := strings.TrimRight(line, "\r\n")
	if strings.TrimSpace(trimmed) == "" {
		return parsedLine{TimestampMs: lastTimestampMs, Level: "UNKNOWN", Message: ""}
	}
	if parsed, ok := parsePattern(trimmed, springBracketPattern); ok {
		return parsed.withFallback(lastTimestampMs)
	}
	if parsed, ok := parsePattern(trimmed, springPattern); ok {
		return parsed.withFallback(lastTimestampMs)
	}
	if parsed, ok := parseISO(trimmed); ok {
		return parsed.withFallback(lastTimestampMs)
	}
	if parsed, ok := parseJSON(trimmed); ok {
		return parsed.withFallback(lastTimestampMs)
	}
	if parsed, ok := parseNginx(trimmed); ok {
		return parsed.withFallback(lastTimestampMs)
	}
	return parsedLine{TimestampMs: lastTimestampMs, Level: "UNKNOWN", Message: trimmed}
}

func (p parsedLine) withFallback(last *int64) parsedLine {
	if p.TimestampMs == nil && last != nil {
		p.TimestampMs = last
	}
	return p
}

func parsePattern(line string, pattern *regexp.Regexp) (parsedLine, bool) {
	match := pattern.FindStringSubmatch(line)
	if match == nil {
		return parsedLine{}, false
	}
	ts := parseLogTimestamp(match[1])
	level := normalizeLevel(match[2])
	message := strings.TrimSpace(line[len(match[0]):])
	return parsedLine{TimestampMs: ts, Level: level, Message: message}, true
}

func parseISO(line string) (parsedLine, bool) {
	match := isoPattern.FindStringSubmatch(line)
	if match == nil {
		return parsedLine{}, false
	}
	ts := parseLogTimestamp(match[1])
	message := strings.TrimSpace(line[len(match[0]):])
	level := "UNKNOWN"
	if parts := regexp.MustCompile(`^(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\b`).FindStringSubmatch(strings.ToUpper(message)); parts != nil {
		level = normalizeLevel(parts[1])
		message = strings.TrimSpace(message[len(parts[0]):])
	}
	return parsedLine{TimestampMs: ts, Level: level, Message: message}, true
}

func parseJSON(line string) (parsedLine, bool) {
	if !strings.HasPrefix(strings.TrimSpace(line), "{") {
		return parsedLine{}, false
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(line), &obj); err != nil {
		return parsedLine{}, false
	}
	var ts *int64
	switch value := firstValue(obj, "timestamp", "time", "@timestamp").(type) {
	case float64:
		v := int64(value)
		ts = &v
	case string:
		ts = parseLogTimestamp(value)
	}
	level := normalizeLevel(fmt.Sprint(firstValue(obj, "level", "severity")))
	message := fmt.Sprint(firstValue(obj, "message", "msg"))
	if message == "<nil>" || message == "" {
		message = line
	}
	return parsedLine{TimestampMs: ts, Level: level, Message: message}, true
}

func parseNginx(line string) (parsedLine, bool) {
	match := nginxPattern.FindStringSubmatch(line)
	if match == nil {
		return parsedLine{}, false
	}
	parsed, err := time.Parse("02/Jan/2006:15:04:05 -0700", match[1])
	if err != nil {
		return parsedLine{Level: "INFO", Message: line}, true
	}
	ms := parsed.UnixMilli()
	return parsedLine{TimestampMs: &ms, Level: "INFO", Message: line}, true
}

func parseLogTimestamp(value string) *int64 {
	value = strings.TrimSpace(value)
	layouts := []string{
		time.RFC3339Nano,
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05.999",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05.999",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		var parsed time.Time
		var err error
		if strings.Contains(layout, "Z07") || strings.HasSuffix(value, "Z") || strings.Contains(value, "+") {
			parsed, err = time.Parse(layout, value)
		} else {
			parsed, err = time.ParseInLocation(layout, value, time.Local)
		}
		if err == nil {
			ms := parsed.UnixMilli()
			return &ms
		}
	}
	return nil
}

func firstValue(obj map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, ok := obj[key]; ok {
			return value
		}
	}
	return nil
}

func normalizeLevel(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "ERROR", "ERR":
		return "ERROR"
	case "WARN", "WARNING":
		return "WARN"
	case "INFO":
		return "INFO"
	case "DEBUG":
		return "DEBUG"
	case "TRACE":
		return "TRACE"
	default:
		return "UNKNOWN"
	}
}

func InferServiceNode(fileName string) (string, string) {
	base := filepath.Base(fileName)
	base = regexp.MustCompile(`(?i)\.(log|txt|gz)$`).ReplaceAllString(base, "")
	parts := regexp.MustCompile(`[-_]`).Split(base, -1)
	if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
		return parts[0], parts[1]
	}
	if base == "" {
		return "unknown", "default"
	}
	return base, "default"
}

func isSystemAdmin(actor identity.Principal) bool {
	return !actor.User.Disabled && actor.User.SystemRole == "admin"
}

func safePathPart(value string) string {
	value = filepath.Base(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^A-Za-z0-9._-]+`).ReplaceAllString(value, "_")
	if value == "" || value == "." {
		return "file"
	}
	return value
}

func newID(prefix string) (string, error) {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate ID: %w", err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buffer), nil
}
