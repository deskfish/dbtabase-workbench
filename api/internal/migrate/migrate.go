package migrate

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const advisoryLockID int64 = 7182215601

//go:embed sql/*.sql
var migrationSQL embed.FS

type migrationFile struct {
	Name string
	SQL  string
}

func migrationFiles() ([]migrationFile, error) {
	entries, err := migrationSQL.ReadDir("sql")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}

	files := make([]migrationFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		contents, err := migrationSQL.ReadFile("sql/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		files = append(files, migrationFile{Name: entry.Name(), SQL: string(contents)})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	return files, nil
}

func Apply(ctx context.Context, pool *pgxpool.Pool) (err error) {
	files, err := migrationFiles()
	if err != nil {
		return err
	}

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", advisoryLockID); err != nil {
		return fmt.Errorf("acquire migration advisory lock: %w", err)
	}
	defer func() {
		unlockCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()

		var unlocked bool
		unlockErr := conn.QueryRow(unlockCtx, "SELECT pg_advisory_unlock($1)", advisoryLockID).Scan(&unlocked)
		if unlockErr != nil {
			err = errors.Join(err, fmt.Errorf("release migration advisory lock: %w", unlockErr))
		} else if !unlocked {
			err = errors.Join(err, errors.New("release migration advisory lock: lock was not held"))
		}
	}()

	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("create schema migrations table: %w", err)
	}

	for _, file := range files {
		if err := applyFile(ctx, conn, file); err != nil {
			return err
		}
	}
	return nil
}

func applyFile(ctx context.Context, conn *pgxpool.Conn, file migrationFile) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", file.Name, err)
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(rollbackCtx)
	}()

	var applied bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", file.Name).Scan(&applied); err != nil {
		return fmt.Errorf("check migration %s: %w", file.Name, err)
	}
	if applied {
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration check %s: %w", file.Name, err)
		}
		return nil
	}

	if _, err := tx.Exec(ctx, file.SQL, pgx.QueryExecModeSimpleProtocol); err != nil {
		return fmt.Errorf("apply migration %s: %w", file.Name, err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", file.Name); err != nil {
		return fmt.Errorf("record migration %s: %w", file.Name, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", file.Name, err)
	}
	return nil
}
