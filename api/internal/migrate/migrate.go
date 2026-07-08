package migrate

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const advisoryLockID int64 = 7182215601

var migrationNamePattern = regexp.MustCompile(`^[0-9]{4}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$`)

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
	if err := sortMigrationFiles(files); err != nil {
		return nil, err
	}
	return files, nil
}

func sortMigrationFiles(files []migrationFile) error {
	for _, file := range files {
		if !migrationNamePattern.MatchString(file.Name) {
			return fmt.Errorf("invalid migration filename %q", file.Name)
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	return nil
}

func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	files, err := migrationFiles()
	if err != nil {
		return err
	}
	return applyMigrations(ctx, pool, files)
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool, files []migrationFile) (err error) {
	files = append([]migrationFile(nil), files...)
	if err := sortMigrationFiles(files); err != nil {
		return err
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}

	lockedConn := &postgresLockedConnection{conn: conn}
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", advisoryLockID); err != nil {
		lockErr := fmt.Errorf("acquire migration advisory lock: %w", err)
		closeCtx, cancelClose := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		closeErr := lockedConn.discard(closeCtx)
		cancelClose()
		if closeErr != nil {
			lockErr = errors.Join(lockErr, fmt.Errorf("close uncertain migration connection: %w", closeErr))
		}
		return lockErr
	}
	defer func() {
		err = finishLockedConnection(ctx, lockedConn, err)
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

type lockedConnection interface {
	unlock(context.Context) (bool, error)
	release()
	discard(context.Context) error
}

type postgresLockedConnection struct {
	conn *pgxpool.Conn
}

func (c *postgresLockedConnection) unlock(ctx context.Context) (bool, error) {
	var unlocked bool
	err := c.conn.QueryRow(ctx, "SELECT pg_advisory_unlock($1)", advisoryLockID).Scan(&unlocked)
	return unlocked, err
}

func (c *postgresLockedConnection) release() {
	c.conn.Release()
}

func (c *postgresLockedConnection) discard(ctx context.Context) error {
	return c.conn.Hijack().Close(ctx)
}

func finishLockedConnection(ctx context.Context, conn lockedConnection, applyErr error) error {
	unlockCtx, cancelUnlock := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	unlocked, unlockErr := conn.unlock(unlockCtx)
	cancelUnlock()
	if unlockErr == nil && unlocked {
		conn.release()
		return applyErr
	}
	if unlockErr == nil {
		unlockErr = errors.New("lock was not held")
	}

	closeCtx, cancelClose := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	closeErr := conn.discard(closeCtx)
	cancelClose()

	err := errors.Join(applyErr, fmt.Errorf("release migration advisory lock: %w", unlockErr))
	if closeErr != nil {
		err = errors.Join(err, fmt.Errorf("close uncertain migration connection: %w", closeErr))
	}
	return err
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
