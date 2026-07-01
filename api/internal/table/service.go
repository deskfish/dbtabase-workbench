package table

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	database "dbworkbench/api/internal/db"
)

var (
	ErrUniqueKeyRequired      = errors.New("a primary or unique key is required")
	ErrUnexpectedAffectedRows = errors.New("mutation affected an unexpected number of rows")
)

type Mutation struct {
	Schema string         `json:"schema"`
	Table  string         `json:"table"`
	Values map[string]any `json:"values,omitempty"`
	Key    map[string]any `json:"key,omitempty"`
}

type Statement struct {
	SQL  string
	Args []any
}

type Execer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func QuoteIdentifier(driver database.Driver, identifier string) (string, error) {
	if identifier == "" || strings.IndexByte(identifier, 0) >= 0 {
		return "", errors.New("invalid empty identifier")
	}
	switch driver {
	case database.MySQL:
		return "`" + strings.ReplaceAll(identifier, "`", "``") + "`", nil
	case database.PostgreSQL:
		return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`, nil
	default:
		return "", fmt.Errorf("unsupported driver %q", driver)
	}
}

func BuildUpdate(driver database.Driver, mutation Mutation) (Statement, error) {
	if len(mutation.Key) == 0 {
		return Statement{}, ErrUniqueKeyRequired
	}
	values := make(map[string]any, len(mutation.Values))
	for name, value := range mutation.Values {
		if _, isKey := mutation.Key[name]; isKey {
			continue
		}
		values[name] = value
	}
	if len(values) == 0 {
		return Statement{}, errors.New("at least one changed value is required")
	}
	tableName, err := qualifiedName(driver, mutation.Schema, mutation.Table)
	if err != nil {
		return Statement{}, err
	}
	args := make([]any, 0, len(values)+len(mutation.Key))
	sets, err := predicates(driver, values, &args, ", ")
	if err != nil {
		return Statement{}, err
	}
	where, err := predicates(driver, mutation.Key, &args, " AND ")
	if err != nil {
		return Statement{}, err
	}
	return Statement{SQL: "UPDATE " + tableName + " SET " + sets + " WHERE " + where, Args: args}, nil
}

func BuildDelete(driver database.Driver, mutation Mutation) (Statement, error) {
	if len(mutation.Key) == 0 {
		return Statement{}, ErrUniqueKeyRequired
	}
	tableName, err := qualifiedName(driver, mutation.Schema, mutation.Table)
	if err != nil {
		return Statement{}, err
	}
	args := make([]any, 0, len(mutation.Key))
	where, err := predicates(driver, mutation.Key, &args, " AND ")
	if err != nil {
		return Statement{}, err
	}
	return Statement{SQL: "DELETE FROM " + tableName + " WHERE " + where, Args: args}, nil
}

func BuildInsert(driver database.Driver, mutation Mutation) (Statement, error) {
	if len(mutation.Values) == 0 {
		return Statement{}, errors.New("at least one value is required")
	}
	tableName, err := qualifiedName(driver, mutation.Schema, mutation.Table)
	if err != nil {
		return Statement{}, err
	}
	keys := sortedKeys(mutation.Values)
	columns, placeholders, args := make([]string, len(keys)), make([]string, len(keys)), make([]any, len(keys))
	for i, key := range keys {
		columns[i], err = QuoteIdentifier(driver, key)
		if err != nil {
			return Statement{}, err
		}
		placeholders[i] = placeholder(driver, i+1)
		args[i] = mutation.Values[key]
	}
	return Statement{SQL: "INSERT INTO " + tableName + " (" + strings.Join(columns, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")", Args: args}, nil
}

func ExecuteOne(ctx context.Context, execer Execer, statement Statement) error {
	result, err := execer.ExecContext(ctx, statement.SQL, statement.Args...)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("%w: got %d", ErrUnexpectedAffectedRows, count)
	}
	return nil
}

func qualifiedName(driver database.Driver, schema, table string) (string, error) {
	quotedTable, err := QuoteIdentifier(driver, table)
	if err != nil {
		return "", err
	}
	if schema == "" {
		return quotedTable, nil
	}
	quotedSchema, err := QuoteIdentifier(driver, schema)
	if err != nil {
		return "", err
	}
	return quotedSchema + "." + quotedTable, nil
}

func predicates(driver database.Driver, values map[string]any, args *[]any, joiner string) (string, error) {
	parts := make([]string, 0, len(values))
	for _, key := range sortedKeys(values) {
		quoted, err := QuoteIdentifier(driver, key)
		if err != nil {
			return "", err
		}
		*args = append(*args, values[key])
		parts = append(parts, quoted+" = "+placeholder(driver, len(*args)))
	}
	return strings.Join(parts, joiner), nil
}

func placeholder(driver database.Driver, position int) string {
	if driver == database.PostgreSQL {
		return fmt.Sprintf("$%d", position)
	}
	return "?"
}

func sortedKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
