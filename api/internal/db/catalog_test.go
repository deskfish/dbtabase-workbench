package db

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestLoadMySQLColumnsUsesColumnTypeWithLength(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("information_schema.columns").WithArgs("fim", "users").WillReturnRows(
		sqlmock.NewRows([]string{"column_name", "column_type", "is_nullable", "column_default", "column_comment"}).
			AddRow("uid", "varchar(255)", "YES", nil, "用户账号").
			AddRow("id", "bigint", "NO", nil, "主键ID"),
	)
	columns, err := loadMySQLColumns(context.Background(), database, "fim", "users")
	if err != nil {
		t.Fatal(err)
	}
	if columns[0].Type != "varchar(255)" {
		t.Fatalf("expected varchar(255), got %q", columns[0].Type)
	}
}

func TestLoadPostgresColumnsUsesFormatType(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("format_type").WithArgs("public", "users").WillReturnRows(
		sqlmock.NewRows([]string{"attname", "format_type", "is_nullable", "column_default"}).
			AddRow("title", "character varying(120)", "YES", nil),
	)
	columns, err := loadPostgresColumns(context.Background(), database, "public", "users")
	if err != nil {
		t.Fatal(err)
	}
	if columns[0].Type != "character varying(120)" {
		t.Fatalf("expected character varying(120), got %q", columns[0].Type)
	}
}
