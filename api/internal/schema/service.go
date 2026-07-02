package schema

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
)

var ErrInvalidToken = errors.New("invalid preview token")
var ErrExpiredToken = errors.New("preview token expired")
var ErrStructureDrift = errors.New("table structure changed")
var ErrConfirmation = errors.New("risk confirmation required")

type tokenData struct {
	Dialect     string      `json:"x"`
	Scope       string      `json:"s"`
	Fingerprint string      `json:"f"`
	Expires     int64       `json:"e"`
	DDL         []Statement `json:"d"`
}
type Service struct {
	secret []byte
	ttl    time.Duration
	mu     sync.Mutex
	used   map[string]struct{}
}

func NewService(secret string, ttl time.Duration) *Service {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &Service{secret: []byte(secret), ttl: ttl, used: map[string]struct{}{}}
}
func (s *Service) Preview(dialect, scope string, before Table, ops []Operation) (Preview, error) {
	p, e := Generate(dialect, before.Schema, before.Name, ops)
	if e != nil {
		return p, e
	}
	p.Fingerprint = Fingerprint(before)
	p.ExpiresAt = time.Now().Add(s.ttl).Unix()
	d := tokenData{Dialect: dialect, Scope: scope, Fingerprint: p.Fingerprint, Expires: p.ExpiresAt, DDL: p.Statements}
	p.Token = s.sign(d)
	return p, nil
}
func (s *Service) Execute(ctx context.Context, db *sql.DB, scope, currentFingerprint, token string, confirmed bool) ([]ExecutionResult, error) {
	d, e := s.verify(token)
	if e != nil {
		return nil, e
	}
	if d.Scope != scope {
		return nil, ErrInvalidToken
	}
	if d.Fingerprint != currentFingerprint {
		return nil, ErrStructureDrift
	}
	for _, st := range d.DDL {
		if st.Destructive && !confirmed {
			return nil, ErrConfirmation
		}
	}
	s.mu.Lock()
	if _, ok := s.used[token]; ok {
		s.mu.Unlock()
		return nil, ErrInvalidToken
	}
	s.used[token] = struct{}{}
	s.mu.Unlock()
	out := make([]ExecutionResult, 0, len(d.DDL))
	executor := interface {
		ExecContext(context.Context, string, ...any) (sql.Result, error)
	}(db)
	var tx *sql.Tx
	if d.Dialect == "postgres" {
		var beginErr error
		tx, beginErr = safeBegin(ctx, db)
		if beginErr != nil {
			return nil, beginErr
		}
		executor = tx
	}
	for _, st := range d.DDL {
		_, err := executor.ExecContext(ctx, st.SQL)
		r := ExecutionResult{SQL: st.SQL, Status: "success"}
		if err != nil {
			r.Status = "failed"
			r.Error = err.Error()
			out = append(out, r)
			if tx != nil {
				_ = tx.Rollback()
			}
			return out, err
		}
		out = append(out, r)
	}
	if tx != nil {
		if err := tx.Commit(); err != nil {
			return out, err
		}
	}
	return out, nil
}
func safeBegin(ctx context.Context, db *sql.DB) (*sql.Tx, error) { return db.BeginTx(ctx, nil) }
func (s *Service) sign(d tokenData) string {
	b, _ := json.Marshal(d)
	payload := base64.RawURLEncoding.EncodeToString(b)
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func (s *Service) verify(token string) (tokenData, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return tokenData{}, ErrInvalidToken
	}
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(parts[0]))
	sig, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil || !hmac.Equal(sig, m.Sum(nil)) {
		return tokenData{}, ErrInvalidToken
	}
	b, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		return tokenData{}, ErrInvalidToken
	}
	var d tokenData
	if json.Unmarshal(b, &d) != nil {
		return d, ErrInvalidToken
	}
	if time.Now().Unix() > d.Expires {
		return d, ErrExpiredToken
	}
	return d, nil
}
