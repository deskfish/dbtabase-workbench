package migrate

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestFilesAreOrderedAndNamed(t *testing.T) {
	files, err := migrationFiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Name != "0001_identity_registry.sql" {
		t.Fatalf("files = %+v", files)
	}
	if !strings.Contains(files[0].SQL, "CREATE TABLE users") || !strings.Contains(files[0].SQL, "CREATE TABLE connections") {
		t.Fatal("required tables missing")
	}
}

func TestSortMigrationFilesOrdersNames(t *testing.T) {
	files := []migrationFile{
		{Name: "0010_tenth.sql"},
		{Name: "0002_second.sql"},
	}

	if err := sortMigrationFiles(files); err != nil {
		t.Fatal(err)
	}
	if files[0].Name != "0002_second.sql" || files[1].Name != "0010_tenth.sql" {
		t.Fatalf("files = %+v", files)
	}
}

func TestSortMigrationFilesRejectsInvalidName(t *testing.T) {
	files := []migrationFile{{Name: "2_Invalid.sql"}}

	err := sortMigrationFiles(files)
	if err == nil || !strings.Contains(err.Error(), "invalid migration filename") {
		t.Fatalf("err = %v", err)
	}
}

func TestFinishLockedConnectionDiscardsOnUncertainUnlock(t *testing.T) {
	applyErr := errors.New("apply failed")
	unlockErr := errors.New("unlock failed")
	closeErr := errors.New("close failed")
	tests := []struct {
		name      string
		unlocked  bool
		unlockErr error
		closeErr  error
	}{
		{name: "unlock error", unlockErr: unlockErr, closeErr: closeErr},
		{name: "unlock false", unlocked: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conn := &fakeLockedConnection{
				unlocked:  tt.unlocked,
				unlockErr: tt.unlockErr,
				closeErr:  tt.closeErr,
			}

			err := finishLockedConnection(context.Background(), conn, applyErr)
			if err == nil {
				t.Fatal("expected unlock error")
			}
			if !errors.Is(err, applyErr) {
				t.Fatalf("err = %v, want apply error", err)
			}
			if conn.released {
				t.Fatal("uncertain connection was released to pool")
			}
			if !conn.discarded {
				t.Fatal("uncertain connection was not discarded")
			}
			if tt.unlockErr != nil && !errors.Is(err, tt.unlockErr) {
				t.Fatalf("err = %v, want unlock error", err)
			}
			if tt.closeErr != nil && !errors.Is(err, tt.closeErr) {
				t.Fatalf("err = %v, want close error", err)
			}
		})
	}
}

func TestFinishLockedConnectionReleasesAfterConfirmedUnlock(t *testing.T) {
	conn := &fakeLockedConnection{unlocked: true}

	if err := finishLockedConnection(context.Background(), conn, nil); err != nil {
		t.Fatal(err)
	}
	if !conn.released {
		t.Fatal("unlocked connection was not released")
	}
	if conn.discarded {
		t.Fatal("unlocked connection was discarded")
	}
}

func TestApplyIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool := integrationPool(t, ctx)

	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("first Apply: %v", err)
	}
	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("second Apply: %v", err)
	}

	var applied int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&applied); err != nil {
		t.Fatalf("count schema migrations: %v", err)
	}
	if applied != 1 {
		t.Fatalf("applied migrations = %d, want 1", applied)
	}

	for _, table := range []string{"users", "teams", "team_members", "connections", "audit_events"} {
		var exists bool
		if err := pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", table).Scan(&exists); err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Errorf("table %s was not created", table)
		}
	}
}

func TestApplyRollsBackInvalidMigrationIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool := integrationPool(t, ctx)

	err := applyMigrations(ctx, pool, []migrationFile{{
		Name: "0002_invalid.sql",
		SQL:  "CREATE TABLE invalid_partial (id integer); THIS IS NOT SQL;",
	}})
	if err == nil {
		t.Fatal("expected invalid migration to fail")
	}

	var applied int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&applied); err != nil {
		t.Fatalf("count schema migrations: %v", err)
	}
	if applied != 0 {
		t.Fatalf("applied migrations = %d, want 0", applied)
	}

	var exists bool
	if err := pool.QueryRow(ctx, "SELECT to_regclass('invalid_partial') IS NOT NULL").Scan(&exists); err != nil {
		t.Fatalf("check partial table: %v", err)
	}
	if exists {
		t.Fatal("partial migration table was not rolled back")
	}
}

func TestApplySerializesConcurrentRunsIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool := integrationPool(t, ctx)
	files := []migrationFile{{
		Name: "0002_concurrent.sql",
		SQL:  "SELECT pg_sleep(0.2); CREATE TABLE concurrent_marker (id integer PRIMARY KEY);",
	}}

	start := make(chan struct{})
	errs := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			errs <- applyMigrations(ctx, pool, files)
		}()
	}
	close(start)
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent Apply: %v", err)
		}
	}

	var applied int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations WHERE version = $1", files[0].Name).Scan(&applied); err != nil {
		t.Fatalf("count concurrent migration: %v", err)
	}
	if applied != 1 {
		t.Fatalf("applied migrations = %d, want 1", applied)
	}
}

func integrationPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("OC_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("OC_TEST_DATABASE_URL is not configured; skipping PostgreSQL migration integration test")
	}

	adminPool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	schema := fmt.Sprintf("migrate_test_%d", time.Now().UnixNano())
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := adminPool.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		adminPool.Close()
		t.Fatalf("create test schema: %v", err)
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		adminPool.Close()
		t.Fatalf("parse test database URL: %v", err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		adminPool.Close()
		t.Fatalf("open schema-scoped pool: %v", err)
	}

	t.Cleanup(func() {
		pool.Close()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if _, err := adminPool.Exec(cleanupCtx, "DROP SCHEMA "+identifier+" CASCADE"); err != nil {
			t.Errorf("drop test schema: %v", err)
		}
		adminPool.Close()
	})
	return pool
}

type fakeLockedConnection struct {
	unlocked  bool
	unlockErr error
	closeErr  error
	released  bool
	discarded bool
}

func (c *fakeLockedConnection) unlock(context.Context) (bool, error) {
	return c.unlocked, c.unlockErr
}

func (c *fakeLockedConnection) release() {
	c.released = true
}

func (c *fakeLockedConnection) discard(context.Context) error {
	c.discarded = true
	return c.closeErr
}
