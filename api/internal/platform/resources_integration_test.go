package platform

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestOpenWithPostgresAndRedisIntegration(t *testing.T) {
	postgresURL := os.Getenv("OC_TEST_DATABASE_URL")
	redisURL := os.Getenv("OC_TEST_REDIS_URL")
	if postgresURL == "" || redisURL == "" {
		t.Skip("OC_TEST_DATABASE_URL and OC_TEST_REDIS_URL are required for dependency integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resources, err := Open(ctx, postgresURL, redisURL)
	if err != nil {
		t.Fatalf("open resources: %v", err)
	}
	defer resources.Close()

	if !resources.Ready(ctx) {
		t.Fatal("resources are not ready")
	}
}
