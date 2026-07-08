package platform

import (
	"context"
	"testing"
	"time"
)

func TestOpenRejectsUnavailablePostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	_, err := Open(ctx, "postgres://127.0.0.1:1/ops", "redis://127.0.0.1:1/0")
	if err == nil {
		t.Fatal("expected dependency error")
	}
}
