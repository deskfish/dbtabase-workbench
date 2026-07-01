package session

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"sync"
	"time"
)

type entry struct {
	db       *sql.DB
	driver   string
	lastUsed time.Time
}

type Store struct {
	mu       sync.RWMutex
	idle     time.Duration
	sessions map[string]map[string]*entry
	now      func() time.Time
}

func NewStore(idle time.Duration) *Store {
	return &Store{idle: idle, sessions: make(map[string]map[string]*entry), now: time.Now}
}

func (s *Store) CreateSession() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	for {
		id := randomID()
		if _, exists := s.sessions[id]; !exists {
			s.sessions[id] = make(map[string]*entry)
			return id
		}
	}
}

func (s *Store) Put(sessionID string, database *sql.DB) string {
	return s.PutConnection(sessionID, database, "")
}

func (s *Store) PutConnection(sessionID string, database *sql.DB, driver string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	connections, ok := s.sessions[sessionID]
	if !ok {
		return ""
	}
	for {
		id := randomID()
		if _, exists := connections[id]; !exists {
			connections[id] = &entry{db: database, driver: driver, lastUsed: s.now()}
			return id
		}
	}
}

func (s *Store) HasSession(sessionID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.sessions[sessionID]
	return ok
}

func (s *Store) GetConnection(sessionID, connectionID string) (*sql.DB, string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	connection, ok := s.sessions[sessionID][connectionID]
	if !ok {
		return nil, "", false
	}
	connection.lastUsed = s.now()
	return connection.db, connection.driver, true
}

func (s *Store) Get(sessionID, connectionID string) (*sql.DB, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	connection, ok := s.sessions[sessionID][connectionID]
	if !ok {
		return nil, false
	}
	connection.lastUsed = s.now()
	return connection.db, true
}

func (s *Store) Delete(sessionID, connectionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if connection := s.sessions[sessionID][connectionID]; connection != nil && connection.db != nil {
		_ = connection.db.Close()
	}
	delete(s.sessions[sessionID], connectionID)
}

func (s *Store) CloseIdle() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	closed := 0
	cutoff := s.now().Add(-s.idle)
	for _, connections := range s.sessions {
		for id, connection := range connections {
			if connection.lastUsed.After(cutoff) {
				continue
			}
			if connection.db != nil {
				_ = connection.db.Close()
			}
			delete(connections, id)
			closed++
		}
	}
	return closed
}

func randomID() string {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		panic("cryptographic random source unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(buffer)
}
