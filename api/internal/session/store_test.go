package session

import (
	"testing"
	"time"
)

func TestStoreScopesConnectionsToOwningSession(t *testing.T) {
	store := NewStore(30 * time.Minute)
	owner := store.CreateSession()
	other := store.CreateSession()
	connectionID := store.Put(owner, nil)
	if connectionID == "" {
		t.Fatal("empty connection ID")
	}
	if _, ok := store.Get(owner, connectionID); !ok {
		t.Fatal("owner cannot retrieve connection")
	}
	if _, ok := store.Get(other, connectionID); ok {
		t.Fatal("connection leaked across sessions")
	}
}

func TestUnknownSessionCannotStoreConnection(t *testing.T) {
	store := NewStore(time.Minute)
	if id := store.Put("unknown", nil); id != "" {
		t.Fatalf("connection ID = %q", id)
	}
}

func TestDeleteRemovesConnection(t *testing.T) {
	store := NewStore(time.Minute)
	sessionID := store.CreateSession()
	connectionID := store.Put(sessionID, nil)
	store.Delete(sessionID, connectionID)
	if _, ok := store.Get(sessionID, connectionID); ok {
		t.Fatal("deleted connection remains accessible")
	}
}
