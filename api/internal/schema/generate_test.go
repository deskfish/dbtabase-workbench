package schema

import (
	"strings"
	"testing"
)

func TestGenerateDialectDDLAndRisks(t *testing.T) {
	operations := []Operation{{Kind: "add_column", Column: Column{Name: "title", Type: "VARCHAR(120)", Nullable: false}}, {Kind: "drop_column", Name: "legacy"}}
	pg, err := Generate("postgres", "public", "articles", operations)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pg.Statements[0].SQL, `ALTER TABLE "public"."articles" ADD COLUMN "title" VARCHAR(120) NOT NULL`) {
		t.Fatalf("unexpected postgres ddl: %s", pg.Statements[0].SQL)
	}
	if pg.Risks[0].Level != "danger" {
		t.Fatalf("drop should be dangerous: %#v", pg.Risks)
	}
	my, err := Generate("mysql", "app", "articles", operations[:1])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(my.Statements[0].SQL, "`app`.`articles`") {
		t.Fatalf("unexpected mysql quoting: %s", my.Statements[0].SQL)
	}
}

func TestFingerprintStable(t *testing.T) {
	a := Fingerprint(Table{Name: "t", Schema: "public", Columns: []Column{{Name: "id", Type: "INT"}}})
	b := Fingerprint(Table{Name: "t", Schema: "public", Columns: []Column{{Name: "id", Type: "INT"}}})
	if a == "" || a != b {
		t.Fatalf("unstable fingerprint: %q %q", a, b)
	}
}
