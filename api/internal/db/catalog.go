package db

import (
	"context"
	"database/sql"
	schemaModel "dbworkbench/api/internal/schema"
	"fmt"
	"strings"
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
	// Keys are available through information_schema in both supported engines.
	keyRows, keyErr := db.QueryContext(ctx, fmt.Sprintf(`SELECT kcu.column_name, tc.constraint_type FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema AND tc.table_name=kcu.table_name WHERE tc.table_schema=%s AND tc.table_name=%s AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE') ORDER BY kcu.ordinal_position`, marker, marker2), schemaName, tableName)
	if keyErr == nil {
		for keyRows.Next() {
			var column, kind string
			if keyRows.Scan(&column, &kind) == nil {
				for i := range detail.Table.Columns {
					if detail.Table.Columns[i].Name == column && kind == "PRIMARY KEY" {
						detail.Table.Columns[i].Primary = true
					}
				}
			}
		}
		_ = keyRows.Close()
	}
	if driver == MySQL {
		_ = loadMySQLObjects(ctx, db, schemaName, tableName, &detail)
	} else {
		_ = loadPostgresObjects(ctx, db, schemaName, tableName, &detail)
	}
	detail.DDL = normalizedDDL(driver, detail.Table)
	return detail, nil
}

func loadMySQLObjects(ctx context.Context, db *sql.DB, schemaName, tableName string, d *TableDetail) error {
	rows, e := db.QueryContext(ctx, `SELECT index_name, non_unique, column_name FROM information_schema.statistics WHERE table_schema=? AND table_name=? ORDER BY index_name,seq_in_index`, schemaName, tableName)
	if e == nil {
		m := map[string]*schemaModel.Index{}
		order := []string{}
		for rows.Next() {
			var n, c string
			var non int
			if rows.Scan(&n, &non, &c) == nil && n != "PRIMARY" {
				if m[n] == nil {
					x := schemaModel.Index{Name: n, Unique: non == 0}
					m[n] = &x
					order = append(order, n)
				}
				m[n].Columns = append(m[n].Columns, c)
			}
		}
		for _, n := range order {
			d.Table.Indexes = append(d.Table.Indexes, *m[n])
		}
		_ = rows.Close()
	}
	return loadForeignKeys(ctx, db, "?", "?", schemaName, tableName, d)
}
func loadPostgresObjects(ctx context.Context, db *sql.DB, schemaName, tableName string, d *TableDetail) error {
	rows, e := db.QueryContext(ctx, `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2 ORDER BY indexname`, schemaName, tableName)
	if e == nil {
		for rows.Next() {
			var n, def string
			if rows.Scan(&n, &def) == nil && !strings.Contains(def, "_pkey") {
				start := strings.Index(def, "(")
				end := strings.LastIndex(def, ")")
				cols := []string{}
				if start >= 0 && end > start {
					for _, c := range strings.Split(def[start+1:end], ",") {
						cols = append(cols, strings.Trim(strings.TrimSpace(c), `"`))
					}
				}
				d.Table.Indexes = append(d.Table.Indexes, schemaModel.Index{Name: n, Columns: cols, Unique: strings.Contains(def, " UNIQUE INDEX ")})
			}
		}
		_ = rows.Close()
	}
	return loadForeignKeys(ctx, db, "$1", "$2", schemaName, tableName, d)
}
func loadForeignKeys(ctx context.Context, db *sql.DB, m1, m2, schemaName, tableName string, d *TableDetail) error {
	q := fmt.Sprintf(`SELECT tc.constraint_name,kcu.column_name,ccu.table_schema,ccu.table_name,ccu.column_name,rc.delete_rule,rc.update_rule FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name AND rc.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema=%s AND tc.table_name=%s ORDER BY tc.constraint_name,kcu.ordinal_position`, m1, m2)
	rows, e := db.QueryContext(ctx, q, schemaName, tableName)
	if e != nil {
		return e
	}
	defer rows.Close()
	m := map[string]*schemaModel.ForeignKey{}
	order := []string{}
	for rows.Next() {
		var n, c, rs, rt, rc, del, upd string
		if rows.Scan(&n, &c, &rs, &rt, &rc, &del, &upd) == nil {
			if m[n] == nil {
				x := schemaModel.ForeignKey{Name: n, RefSchema: rs, RefTable: rt, OnDelete: del, OnUpdate: upd}
				m[n] = &x
				order = append(order, n)
			}
			m[n].Columns = append(m[n].Columns, c)
			m[n].RefColumns = append(m[n].RefColumns, rc)
		}
	}
	for _, n := range order {
		d.Table.ForeignKeys = append(d.Table.ForeignKeys, *m[n])
	}
	return nil
}
func normalizedDDL(driver Driver, t schemaModel.Table) string {
	mark := `"`
	if driver == MySQL {
		mark = "`"
	}
	parts := []string{}
	pk := []string{}
	for _, c := range t.Columns {
		x := mark + c.Name + mark + " " + strings.ToUpper(c.Type)
		if !c.Nullable {
			x += " NOT NULL"
		}
		if c.Default != nil {
			x += " DEFAULT " + *c.Default
		}
		parts = append(parts, x)
		if c.Primary {
			pk = append(pk, mark+c.Name+mark)
		}
	}
	if len(pk) > 0 {
		parts = append(parts, "PRIMARY KEY ("+strings.Join(pk, ", ")+")")
	}
	return "CREATE TABLE " + mark + t.Schema + mark + "." + mark + t.Name + mark + " (\n  " + strings.Join(parts, ",\n  ") + "\n);"
}
