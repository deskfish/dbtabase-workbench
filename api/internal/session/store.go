package session

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"sync"
	"time"

	database "dbworkbench/api/internal/db"
)

type entry struct {
	handle   *database.Handle
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

func (s *Store) Put(sessionID string, dbHandle *sql.DB) string {
	handle := &database.Handle{SQL: dbHandle}
	return s.PutHandle(sessionID, handle)
}

func (s *Store) PutConnection(sessionID string, dbHandle *sql.DB, driver string, config database.ConnectionInput) string {
	handle := &database.Handle{Driver: database.Driver(driver), Config: config, SQL: dbHandle}
	return s.PutHandle(sessionID, handle)
}

func (s *Store) PutHandle(sessionID string, handle *database.Handle) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	connections, ok := s.sessions[sessionID]
	if !ok {
		return ""
	}
	for {
		id := randomID()
		if _, exists := connections[id]; !exists {
			connections[id] = &entry{handle: handle, lastUsed: s.now()}
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

func (s *Store) GetHandle(sessionID, connectionID string) (*database.Handle, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	connection, ok := s.sessions[sessionID][connectionID]
	if !ok || connection.handle == nil {
		return nil, false
	}
	connection.lastUsed = s.now()
	return connection.handle, true
}

func (s *Store) GetConnection(sessionID, connectionID string) (*sql.DB, string, bool) {
	handle, ok := s.GetHandle(sessionID, connectionID)
	if !ok || handle.SQL == nil {
		if ok {
			return nil, string(handle.Driver), true
		}
		return nil, "", false
	}
	return handle.SQL, string(handle.Driver), true
}

func (s *Store) GetConnectionConfig(sessionID, connectionID string) (database.ConnectionInput, string, bool) {
	handle, ok := s.GetHandle(sessionID, connectionID)
	if !ok {
		return database.ConnectionInput{}, "", false
	}
	return handle.Config, handle.Config.Database, true
}

func (s *Store) ReplaceDatabase(sessionID, connectionID string, dbHandle *sql.DB, databaseName string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	connection, ok := s.sessions[sessionID][connectionID]
	if !ok || connection.handle == nil {
		return false
	}
	if connection.handle.SQL != nil && connection.handle.SQL != dbHandle {
		_ = connection.handle.SQL.Close()
	}
	connection.handle.SQL = dbHandle
	connection.handle.Config.Database = databaseName
	connection.lastUsed = s.now()
	return true
}

func (s *Store) ReplaceHandle(sessionID, connectionID string, handle *database.Handle) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	connection, ok := s.sessions[sessionID][connectionID]
	if !ok {
		return false
	}
	if connection.handle != nil {
		_ = connection.handle.Close()
	}
	connection.handle = handle
	connection.lastUsed = s.now()
	return true
}

func (s *Store) Get(sessionID, connectionID string) (*sql.DB, bool) {
	dbHandle, _, ok := s.GetConnection(sessionID, connectionID)
	return dbHandle, ok
}

func (s *Store) Delete(sessionID, connectionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if connection := s.sessions[sessionID][connectionID]; connection != nil && connection.handle != nil {
		_ = connection.handle.Close()
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
			if connection.handle != nil {
				_ = connection.handle.Close()
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
