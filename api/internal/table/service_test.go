package table

import (
	"errors"
	"testing"

	database "dbworkbench/api/internal/db"
)

func TestQuoteIdentifierEscapesDialectDelimiter(t *testing.T) {
	if got, err := QuoteIdentifier(database.MySQL, "odd`name"); err != nil || got != "`odd``name`" {
		t.Fatalf("MySQL quote = %q err=%v", got, err)
	}
	if got, err := QuoteIdentifier(database.PostgreSQL, `odd"name`); err != nil || got != `"odd""name"` {
		t.Fatalf("Postgres quote = %q err=%v", got, err)
	}
}

func TestBuildUpdateRequiresUniqueKey(t *testing.T) {
	_, err := BuildUpdate(database.PostgreSQL, Mutation{Schema: "public", Table: "events", Values: map[string]any{"name": "x"}})
	if !errors.Is(err, ErrUniqueKeyRequired) {
		t.Fatalf("err = %v", err)
	}
}

func TestBuildUpdateUsesParametersAndStableOrder(t *testing.T) {
	statement, err := BuildUpdate(database.PostgreSQL, Mutation{
		Schema: "public", Table: "people",
		Values: map[string]any{"name": "Ada", "active": true},
		Key:    map[string]any{"id": 7},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `UPDATE "public"."people" SET "active" = $1, "name" = $2 WHERE "id" = $3`
	if statement.SQL != want {
		t.Fatalf("SQL = %q", statement.SQL)
	}
	if len(statement.Args) != 3 || statement.Args[1] != "Ada" || statement.Args[2] != 7 {
		t.Fatalf("args = %#v", statement.Args)
	}
}

func TestBuildUpdateIgnoresKeyColumnsInSetClause(t *testing.T) {
	statement, err := BuildUpdate(database.PostgreSQL, Mutation{
		Schema: "public", Table: "people",
		Values: map[string]any{"id": 9, "name": "Ada"},
		Key:    map[string]any{"id": 7},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `UPDATE "public"."people" SET "name" = $1 WHERE "id" = $2`
	if statement.SQL != want {
		t.Fatalf("SQL = %q", statement.SQL)
	}
}

func TestBuildDeleteUsesMySQLPlaceholders(t *testing.T) {
	statement, err := BuildDelete(database.MySQL, Mutation{Schema: "sales", Table: "orders", Key: map[string]any{"id": 9}})
	if err != nil {
		t.Fatal(err)
	}
	if statement.SQL != "DELETE FROM `sales`.`orders` WHERE `id` = ?" || len(statement.Args) != 1 {
		t.Fatalf("statement = %+v", statement)
	}
}
