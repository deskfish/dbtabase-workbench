package identity

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestSessionRoundTripAndExpiry(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	defer client.Close()

	sessions := NewSessions(client, 12*time.Hour)
	created, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "" || created.CSRFToken == "" || created.UserID != "usr_alice" {
		t.Fatalf("created = %+v", created)
	}

	loaded, err := sessions.Get(context.Background(), created.ID)
	if err != nil || loaded.UserID != "usr_alice" || loaded.CSRFToken == "" {
		t.Fatalf("loaded = %+v err = %v", loaded, err)
	}

	server.FastForward(13 * time.Hour)
	if _, err := sessions.Get(context.Background(), created.ID); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("err = %v, want %v", err, ErrSessionNotFound)
	}
}

func TestDeleteUserRevokesAllSessions(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	defer client.Close()

	sessions := NewSessions(client, 12*time.Hour)
	first, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}
	second, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}
	other, err := sessions.Create(context.Background(), "usr_bob")
	if err != nil {
		t.Fatal(err)
	}

	if err := sessions.DeleteUser(context.Background(), "usr_alice"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{first.ID, second.ID} {
		if _, err := sessions.Get(context.Background(), id); !errors.Is(err, ErrSessionNotFound) {
			t.Fatalf("session %s err = %v, want %v", id, err, ErrSessionNotFound)
		}
	}
	if _, err := sessions.Get(context.Background(), other.ID); err != nil {
		t.Fatalf("other user's session was revoked: %v", err)
	}
}
