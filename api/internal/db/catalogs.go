package db

import (
	"context"
	"database/sql"
	"fmt"
)

func ListDatabases(ctx context.Context, handle *Handle) ([]string, error) {
	switch handle.Driver {
	case PostgreSQL:
		db, err := handle.SQLDB()
		if err != nil {
			return nil, err
		}
		return listPostgresDatabases(ctx, db)
	case MySQL:
		db, err := handle.SQLDB()
		if err != nil {
			return nil, err
		}
		return listMySQLDatabases(ctx, db)
	case MongoDB:
		client, err := handle.MongoDB()
		if err != nil {
			return nil, err
		}
		return ListMongoDatabases(ctx, client)
	case Redis:
		client, err := handle.RedisClient()
		if err != nil {
			return nil, err
		}
		return ListRedisDatabases(ctx, client)
	default:
		return nil, fmt.Errorf("unsupported database driver %q", handle.Driver)
	}
}

// ListDatabasesSQL keeps the SQL-only signature for existing callers.
func ListDatabasesSQL(ctx context.Context, database *sql.DB, driver Driver) ([]string, error) {
	return ListDatabases(ctx, &Handle{Driver: driver, SQL: database})
}

func listPostgresDatabases(ctx context.Context, database *sql.DB) ([]string, error) {
	rows, err := database.QueryContext(ctx, `SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname`)
	if err != nil {
		return nil, fmt.Errorf("list postgres databases: %w", err)
	}
	defer rows.Close()
	names := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan postgres database: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func listMySQLDatabases(ctx context.Context, database *sql.DB) ([]string, error) {
	rows, err := database.QueryContext(ctx, `SHOW DATABASES`)
	if err != nil {
		return nil, fmt.Errorf("list mysql databases: %w", err)
	}
	defer rows.Close()
	names := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan mysql database: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}
