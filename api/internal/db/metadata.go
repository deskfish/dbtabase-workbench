package db

import (
	"context"
	"database/sql"
	"fmt"
)

type Object struct {
	Kind     string `json:"kind"`
	Catalog  string `json:"catalog,omitempty"`
	Schema   string `json:"schema,omitempty"`
	Name     string `json:"name"`
	Parent   string `json:"parent,omitempty"`
	DataType string `json:"dataType,omitempty"`
	Nullable bool   `json:"nullable,omitempty"`
}

func Metadata(ctx context.Context, database *sql.DB, driver Driver) ([]Object, error) {
	_ = driver
	query := `SELECT table_catalog, table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'mysql', 'performance_schema', 'sys')
ORDER BY table_catalog, table_schema, table_name, ordinal_position`
	rows, err := database.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("load database metadata: %w", err)
	}
	defer rows.Close()
	objects := make([]Object, 0)
	seenTables := make(map[string]struct{})
	for rows.Next() {
		var catalog, schema, table, column, dataType, nullable string
		if err := rows.Scan(&catalog, &schema, &table, &column, &dataType, &nullable); err != nil {
			return nil, fmt.Errorf("scan database metadata: %w", err)
		}
		key := catalog + "\x00" + schema + "\x00" + table
		if _, ok := seenTables[key]; !ok {
			objects = append(objects, Object{Kind: "table", Catalog: catalog, Schema: schema, Name: table})
			seenTables[key] = struct{}{}
		}
		objects = append(objects, Object{Kind: "column", Catalog: catalog, Schema: schema, Name: column, Parent: table, DataType: dataType, Nullable: nullable == "YES"})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate database metadata: %w", err)
	}
	return objects, nil
}
