package db

import (
	"context"
	"database/sql"
	"fmt"
)

// ListDatabases 列出当前实例上可连接的数据库。
func ListDatabases(ctx context.Context, database *sql.DB, driver Driver) ([]string, error) {
	switch driver {
	case PostgreSQL:
		return listPostgresDatabases(ctx, database)
	case MySQL:
		return listMySQLDatabases(ctx, database)
	default:
		return nil, fmt.Errorf("unsupported database driver %q", driver)
	}
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
