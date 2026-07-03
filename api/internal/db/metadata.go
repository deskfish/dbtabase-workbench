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

func Metadata(ctx context.Context, handle *Handle) ([]Object, error) {
	switch handle.Driver {
	case MongoDB:
		client, err := handle.MongoDB()
		if err != nil {
			return nil, err
		}
		return MongoMetadata(ctx, client, handle.Config.Database)
	case Redis:
		return []Object{}, nil
	default:
		db, err := handle.SQLDB()
		if err != nil {
			return nil, err
		}
		return metadataSQL(ctx, db, handle.Driver, handle.Config.Database)
	}
}

func MetadataSQL(ctx context.Context, database *sql.DB, driver Driver, currentDatabase string) ([]Object, error) {
	return metadataSQL(ctx, database, driver, currentDatabase)
}

func metadataSQL(ctx context.Context, database *sql.DB, driver Driver, currentDatabase string) ([]Object, error) {
	objects, err := loadColumnMetadata(ctx, database, driver, currentDatabase)
	if err != nil {
		return nil, err
	}
	keys, err := loadKeyMetadata(ctx, database, driver, currentDatabase)
	if err != nil {
		return nil, err
	}
	return append(objects, keys...), nil
}

func loadColumnMetadata(ctx context.Context, database *sql.DB, driver Driver, currentDatabase string) ([]Object, error) {
	query := `SELECT table_catalog, table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'mysql', 'performance_schema', 'sys')`
	args := make([]any, 0, 1)
	if driver == MySQL && currentDatabase != "" {
		query += ` AND table_schema = ?`
		args = append(args, currentDatabase)
	}
	query += ` ORDER BY table_catalog, table_schema, table_name, ordinal_position`
	rows, err := database.QueryContext(ctx, query, args...)
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

func loadKeyMetadata(ctx context.Context, database *sql.DB, driver Driver, currentDatabase string) ([]Object, error) {
	var query string
	args := make([]any, 0, 1)
	switch driver {
	case MySQL:
		query = `SELECT kcu.table_schema, kcu.table_name, kcu.column_name, tc.constraint_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_schema = kcu.constraint_schema
 AND tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
  AND tc.table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')`
		if currentDatabase != "" {
			query += ` AND tc.table_schema = ?`
			args = append(args, currentDatabase)
		}
		query += ` ORDER BY kcu.table_schema, kcu.table_name,
  CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 0 ELSE 1 END,
  tc.constraint_name, kcu.ordinal_position`
	default:
		query = `SELECT tc.table_catalog, tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name, tc.constraint_type
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
  tc.constraint_name, kcu.ordinal_position`
	}
	keyRows, err := database.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("load database keys: %w", err)
	}
	defer keyRows.Close()
	objects := make([]Object, 0)
	chosen := make(map[string]string)
	for keyRows.Next() {
		var catalog, schema, table, column, constraint, constraintType string
		if driver == MySQL {
			if err := keyRows.Scan(&schema, &table, &column, &constraint, &constraintType); err != nil {
				return nil, fmt.Errorf("scan database keys: %w", err)
			}
			catalog = "def"
		} else if err := keyRows.Scan(&catalog, &schema, &table, &column, &constraint, &constraintType); err != nil {
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
