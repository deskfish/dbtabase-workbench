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
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close database metadata: %w", err)
	}
	keyRows, err := database.QueryContext(ctx, `SELECT tc.table_catalog, tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_catalog = kcu.constraint_catalog
 AND tc.constraint_schema = kcu.constraint_schema
 AND tc.constraint_name = kcu.constraint_name
 AND tc.table_name = kcu.table_name
WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
  AND tc.table_schema NOT IN ('information_schema', 'pg_catalog', 'mysql', 'performance_schema', 'sys')
ORDER BY tc.table_catalog, tc.table_schema, tc.table_name,
  CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 0 ELSE 1 END,
  tc.constraint_name, kcu.ordinal_position`)
	if err != nil {
		return nil, fmt.Errorf("load database keys: %w", err)
	}
	defer keyRows.Close()
	chosen := make(map[string]string)
	for keyRows.Next() {
		var catalog, schema, table, column, constraint, constraintType string
		if err := keyRows.Scan(&catalog, &schema, &table, &column, &constraint, &constraintType); err != nil {
			return nil, fmt.Errorf("scan database keys: %w", err)
		}
		key := catalog + "\x00" + schema + "\x00" + table
		if selected, ok := chosen[key]; ok && selected != constraint {
			continue
		}
		chosen[key] = constraint
		objects = append(objects, Object{Kind: "key", Catalog: catalog, Schema: schema, Name: column, Parent: table, DataType: constraintType})
	}
	if err := keyRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate database keys: %w", err)
	}
	return objects, nil
}
