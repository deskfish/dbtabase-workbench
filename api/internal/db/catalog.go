package db

import (
	"context"
	"database/sql"
	schemaModel "dbworkbench/api/internal/schema"
	"fmt"
)

type Capabilities struct {
	SchemaEdit       bool `json:"schemaEdit"`
	IndexEdit        bool `json:"indexEdit"`
	ForeignKeyEdit   bool `json:"foreignKeyEdit"`
	TransactionalDDL bool `json:"transactionalDDL"`
}
type TableDetail struct {
	Table         schemaModel.Table `json:"table"`
	Capabilities  Capabilities      `json:"capabilities"`
	DDL           string            `json:"ddl,omitempty"`
	EstimatedRows int64             `json:"estimatedRows,omitempty"`
	Permissions   []string          `json:"permissions"`
}

func DescribeTable(ctx context.Context, db *sql.DB, driver Driver, schemaName, tableName string) (TableDetail, error) {
	marker := "?"
	if driver == PostgreSQL {
		marker = "$1"
	}
	marker2 := "?"
	if driver == PostgreSQL {
		marker2 = "$2"
	}
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position`, marker, marker2), schemaName, tableName)
	if err != nil {
		return TableDetail{}, fmt.Errorf("load table columns: %w", err)
	}
	defer rows.Close()
	detail := TableDetail{Table: schemaModel.Table{Schema: schemaName, Name: tableName}, Capabilities: Capabilities{SchemaEdit: true, IndexEdit: true, ForeignKeyEdit: true, TransactionalDDL: driver == PostgreSQL}, Permissions: []string{}}
	for rows.Next() {
		var name, typ, nullable string
		var def sql.NullString
		if err := rows.Scan(&name, &typ, &nullable, &def); err != nil {
			return TableDetail{}, err
		}
		c := schemaModel.Column{Name: name, Type: typ, Nullable: nullable == "YES"}
		if def.Valid {
			v := def.String
			c.Default = &v
		}
		detail.Table.Columns = append(detail.Table.Columns, c)
	}
	if err := rows.Err(); err != nil {
		return TableDetail{}, err
	}
	if len(detail.Table.Columns) == 0 {
		return TableDetail{}, fmt.Errorf("table not found")
	}
	return detail, nil
}
