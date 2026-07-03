package schema

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var identRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_$]*$`)
var typeRE = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_ ]*(\([0-9]+(,[0-9]+)?\))?(\[\])?$`)

func Fingerprint(table Table) string {
	b, _ := json.Marshal(table)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func Generate(dialect, schemaName, tableName string, ops []Operation) (Preview, error) {
	q, err := quoter(dialect)
	if err != nil {
		return Preview{}, err
	}
	table, err := qualified(q, schemaName, tableName)
	if err != nil {
		return Preview{}, err
	}
	p := Preview{Statements: []Statement{}, Risks: []Risk{}}
	for _, op := range ops {
		var sql string
		destructive := false
		switch op.Kind {
		case "add_column":
			def, err := columnDef(dialect, q, op.Column)
			if err != nil {
				return Preview{}, err
			}
			p.Statements = append(p.Statements, Statement{SQL: fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", table, def)})
			if dialect == "postgres" && strings.TrimSpace(op.Column.Comment) != "" {
				col, e := q(op.Column.Name)
				if e != nil {
					return Preview{}, e
				}
				p.Statements = append(p.Statements, Statement{SQL: fmt.Sprintf("COMMENT ON COLUMN %s.%s IS %s", table, col, sqlStringLiteral(op.Column.Comment))})
			}
			continue
		case "drop_column":
			n, err := q(op.Name)
			if err != nil {
				return Preview{}, err
			}
			sql = fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", table, n)
			destructive = true
			p.Risks = append(p.Risks, Risk{Level: "danger", Kind: "drop_column", Target: op.Name, Message: "删除字段会永久丢失该列数据"})
		case "rename_column":
			a, e := q(op.Name)
			if e != nil {
				return Preview{}, e
			}
			b, e := q(op.NewName)
			if e != nil {
				return Preview{}, e
			}
			sql = fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s", table, a, b)
		case "alter_column":
			n, e := q(op.Column.Name)
			if e != nil {
				return Preview{}, e
			}
			if !typeRE.MatchString(op.Column.Type) {
				return Preview{}, fmt.Errorf("invalid column type")
			}
			if dialect == "postgres" {
				actions := []string{fmt.Sprintf("ALTER COLUMN %s TYPE %s", n, strings.ToUpper(op.Column.Type))}
				if op.Column.Nullable {
					actions = append(actions, fmt.Sprintf("ALTER COLUMN %s DROP NOT NULL", n))
				} else {
					actions = append(actions, fmt.Sprintf("ALTER COLUMN %s SET NOT NULL", n))
				}
				if op.Column.Default == nil {
					actions = append(actions, fmt.Sprintf("ALTER COLUMN %s DROP DEFAULT", n))
				} else {
					actions = append(actions, fmt.Sprintf("ALTER COLUMN %s SET DEFAULT %s", n, *op.Column.Default))
				}
				sql = fmt.Sprintf("ALTER TABLE %s %s", table, strings.Join(actions, ", "))
			} else {
				def, e := columnDef(dialect, q, op.Column)
				if e != nil {
					return Preview{}, e
				}
				sql = fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s", table, def)
			}
			p.Risks = append(p.Risks, Risk{Level: "warning", Kind: "alter_column", Target: op.Column.Name, Message: "修改字段类型可能导致数据转换失败"})
		case "set_column_comment":
			col, e := q(op.Column.Name)
			if e != nil {
				return Preview{}, e
			}
			if dialect == "postgres" {
				if strings.TrimSpace(op.Column.Comment) == "" {
					sql = fmt.Sprintf("COMMENT ON COLUMN %s.%s IS NULL", table, col)
				} else {
					sql = fmt.Sprintf("COMMENT ON COLUMN %s.%s IS %s", table, col, sqlStringLiteral(op.Column.Comment))
				}
			} else {
				def, e := columnDef(dialect, q, op.Column)
				if e != nil {
					return Preview{}, e
				}
				sql = fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s", table, def)
			}
		case "set_primary":
			col, e := q(op.Name)
			if e != nil {
				return Preview{}, e
			}
			if dialect == "mysql" {
				sql = fmt.Sprintf("ALTER TABLE %s DROP PRIMARY KEY, ADD PRIMARY KEY (%s)", table, col)
			} else {
				constraint, e := q(tableName + "_pkey")
				if e != nil {
					return Preview{}, e
				}
				p.Statements = append(p.Statements, Statement{SQL: fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS %s", table, constraint), Destructive: true})
				sql = fmt.Sprintf("ALTER TABLE %s ADD PRIMARY KEY (%s)", table, col)
			}
			p.Risks = append(p.Risks, Risk{Level: "warning", Kind: "set_primary", Target: op.Name, Message: "修改主键可能影响关联表与查询性能"})
		case "drop_primary":
			if dialect == "mysql" {
				sql = fmt.Sprintf("ALTER TABLE %s DROP PRIMARY KEY", table)
			} else {
				constraint, e := q(tableName + "_pkey")
				if e != nil {
					return Preview{}, e
				}
				sql = fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS %s", table, constraint)
			}
			destructive = true
			p.Risks = append(p.Risks, Risk{Level: "danger", Kind: "drop_primary", Target: tableName, Message: "删除主键后表数据编辑能力会受限"})
		case "add_index":
			sql, err = addIndexSQL(dialect, q, table, op.Index)
			if err != nil {
				return Preview{}, err
			}
		case "drop_index":
			n, e := q(op.Name)
			if e != nil {
				return Preview{}, e
			}
			if dialect == "postgres" {
				sql = fmt.Sprintf("DROP INDEX %s", n)
			} else {
				sql = fmt.Sprintf("ALTER TABLE %s DROP INDEX %s", table, n)
			}
			destructive = true
			p.Risks = append(p.Risks, Risk{Level: "warning", Kind: "drop_index", Target: op.Name, Message: "删除索引可能影响查询性能"})
		case "add_foreign_key":
			sql, err = foreignKeySQL(q, table, op.ForeignKey)
			if err != nil {
				return Preview{}, err
			}
		case "drop_foreign_key":
			n, e := q(op.Name)
			if e != nil {
				return Preview{}, e
			}
			keyword := "CONSTRAINT"
			if dialect == "mysql" {
				keyword = "FOREIGN KEY"
			}
			sql = fmt.Sprintf("ALTER TABLE %s DROP %s %s", table, keyword, n)
			destructive = true
			p.Risks = append(p.Risks, Risk{Level: "warning", Kind: "drop_foreign_key", Target: op.Name, Message: "删除外键会移除引用完整性保护"})
		default:
			return Preview{}, fmt.Errorf("unsupported schema operation %q", op.Kind)
		}
		p.Statements = append(p.Statements, Statement{SQL: sql, Destructive: destructive})
	}
	if dialect == "mysql" && len(p.Statements) > 1 {
		p.Warnings = append(p.Warnings, "MySQL DDL 可能隐式提交，多条语句无法保证原子回滚")
	}
	return p, nil
}

func quoter(d string) (func(string) (string, error), error) {
	var mark string
	if d == "postgres" {
		mark = `"`
	} else if d == "mysql" {
		mark = "`"
	} else {
		return nil, fmt.Errorf("unsupported dialect")
	}
	return func(s string) (string, error) {
		if !identRE.MatchString(s) {
			return "", fmt.Errorf("invalid identifier %q", s)
		}
		return mark + s + mark, nil
	}, nil
}
func qualified(q func(string) (string, error), s, t string) (string, error) {
	a, e := q(s)
	if e != nil {
		return "", e
	}
	b, e := q(t)
	return a + "." + b, e
}
func columnDef(dialect string, q func(string) (string, error), c Column) (string, error) {
	n, e := q(c.Name)
	if e != nil {
		return "", e
	}
	if !typeRE.MatchString(c.Type) {
		return "", fmt.Errorf("invalid column type")
	}
	v := n + " " + strings.ToUpper(c.Type)
	if !c.Nullable {
		v += " NOT NULL"
	}
	if c.Default != nil {
		if strings.ContainsAny(*c.Default, ";\x00") {
			return "", fmt.Errorf("invalid default")
		}
		v += " DEFAULT " + *c.Default
	}
	if dialect == "mysql" {
		if strings.ContainsAny(c.Comment, ";\x00") {
			return "", fmt.Errorf("invalid comment")
		}
		v += " COMMENT " + sqlStringLiteral(c.Comment)
	}
	return v, nil
}

func sqlStringLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
func addIndexSQL(d string, q func(string) (string, error), table string, i Index) (string, error) {
	n, e := q(i.Name)
	if e != nil {
		return "", e
	}
	cols := []string{}
	for _, c := range i.Columns {
		x, e := q(c)
		if e != nil {
			return "", e
		}
		cols = append(cols, x)
	}
	u := ""
	if i.Unique {
		u = "UNIQUE "
	}
	if d == "postgres" {
		return fmt.Sprintf("CREATE %sINDEX %s ON %s (%s)", u, n, table, strings.Join(cols, ", ")), nil
	}
	return fmt.Sprintf("ALTER TABLE %s ADD %sINDEX %s (%s)", table, u, n, strings.Join(cols, ", ")), nil
}
func foreignKeySQL(q func(string) (string, error), table string, f ForeignKey) (string, error) {
	n, e := q(f.Name)
	if e != nil {
		return "", e
	}
	ref, e := qualified(q, f.RefSchema, f.RefTable)
	if e != nil {
		return "", e
	}
	cols := []string{}
	refs := []string{}
	for _, c := range f.Columns {
		x, e := q(c)
		if e != nil {
			return "", e
		}
		cols = append(cols, x)
	}
	for _, c := range f.RefColumns {
		x, e := q(c)
		if e != nil {
			return "", e
		}
		refs = append(refs, x)
	}
	if len(cols) == 0 || len(cols) != len(refs) {
		return "", fmt.Errorf("foreign key columns mismatch")
	}
	sql := fmt.Sprintf("ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)", table, n, strings.Join(cols, ", "), ref, strings.Join(refs, ", "))
	for _, x := range []struct{ k, v string }{{"ON DELETE", f.OnDelete}, {"ON UPDATE", f.OnUpdate}} {
		if x.v != "" {
			v := strings.ToUpper(x.v)
			if v != "CASCADE" && v != "RESTRICT" && v != "SET NULL" && v != "NO ACTION" {
				return "", fmt.Errorf("invalid foreign key action")
			}
			sql += " " + x.k + " " + v
		}
	}
	return sql, nil
}
