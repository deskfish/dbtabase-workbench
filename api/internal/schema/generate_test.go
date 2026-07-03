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

func TestGenerateColumnCommentDDL(t *testing.T) {
	pg, err := Generate("postgres", "public", "articles", []Operation{{Kind: "set_column_comment", Column: Column{Name: "title", Type: "text", Nullable: true, Comment: "标题"}}})
	if err != nil {
		t.Fatal(err)
	}
	if pg.Statements[0].SQL != `COMMENT ON COLUMN "public"."articles"."title" IS '标题'` {
		t.Fatalf("unexpected postgres comment ddl: %s", pg.Statements[0].SQL)
	}

	my, err := Generate("mysql", "app", "articles", []Operation{{Kind: "add_column", Column: Column{Name: "note", Type: "varchar(50)", Nullable: true, Comment: "备注"}}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(my.Statements[0].SQL, "COMMENT '备注'") {
		t.Fatalf("unexpected mysql comment ddl: %s", my.Statements[0].SQL)
	}
}

func TestGeneratePrimaryKeyDDL(t *testing.T) {
	my, err := Generate("mysql", "app", "users", []Operation{{Kind: "set_primary", Name: "id"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(my.Statements[0].SQL, "DROP PRIMARY KEY, ADD PRIMARY KEY (`id`)") {
		t.Fatalf("unexpected mysql primary ddl: %s", my.Statements[0].SQL)
	}

	pg, err := Generate("postgres", "public", "users", []Operation{{Kind: "set_primary", Name: "id"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(pg.Statements) != 2 {
		t.Fatalf("expected drop+add primary key statements, got %#v", pg.Statements)
	}
}

func TestFingerprintStable(t *testing.T) {
	a := Fingerprint(Table{Name: "t", Schema: "public", Columns: []Column{{Name: "id", Type: "INT"}}})
	b := Fingerprint(Table{Name: "t", Schema: "public", Columns: []Column{{Name: "id", Type: "INT"}}})
	if a == "" || a != b {
		t.Fatalf("unstable fingerprint: %q %q", a, b)
	}
}
