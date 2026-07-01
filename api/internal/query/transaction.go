package query

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

var ErrTransactionNotFound = errors.New("transaction not found")

type transactionEntry struct {
	scope    string
	tx       *sql.Tx
	lastUsed time.Time
}

type TransactionService struct {
	mu    sync.Mutex
	idle  time.Duration
	items map[string]*transactionEntry
	now   func() time.Time
}

func NewTransactionService(idle time.Duration) *TransactionService {
	return &TransactionService{idle: idle, items: make(map[string]*transactionEntry), now: time.Now}
}

func (s *TransactionService) Begin(scope string, database *sql.DB) (string, error) {
	tx, err := database.BeginTx(context.Background(), nil)
	if err != nil {
		return "", err
	}
	id := transactionID()
	s.mu.Lock()
	s.items[id] = &transactionEntry{scope: scope, tx: tx, lastUsed: s.now()}
	s.mu.Unlock()
	return id, nil
}

func (s *TransactionService) Get(scope, id string) (*sql.Tx, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.items[id]
	if !ok || item.scope != scope {
		return nil, false
	}
	item.lastUsed = s.now()
	return item.tx, true
}

func (s *TransactionService) Commit(scope, id string) error {
	item, err := s.take(scope, id)
	if err != nil {
		return err
	}
	return item.tx.Commit()
}

func (s *TransactionService) Rollback(scope, id string) error {
	item, err := s.take(scope, id)
	if err != nil {
		return err
	}
	return item.tx.Rollback()
}

func (s *TransactionService) CloseIdle() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := s.now().Add(-s.idle)
	closed := 0
	for id, item := range s.items {
		if item.lastUsed.After(cutoff) {
			continue
		}
		_ = item.tx.Rollback()
		delete(s.items, id)
		closed++
	}
	return closed
}

func (s *TransactionService) take(scope, id string) (*transactionEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.items[id]
	if !ok || item.scope != scope {
		return nil, ErrTransactionNotFound
	}
	delete(s.items, id)
	return item, nil
}

func transactionID() string {
	value := make([]byte, 24)
	if _, err := rand.Read(value); err != nil {
		panic("cryptographic random source unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(value)
}
