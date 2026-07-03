package db

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestMetadataIncludesPrimaryAndUniqueKeyColumns(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("information_schema.columns").WillReturnRows(sqlmock.NewRows([]string{"table_catalog", "table_schema", "table_name", "column_name", "data_type", "is_nullable"}).AddRow("app", "public", "people", "id", "integer", "NO"))
	mock.ExpectQuery("table_constraints").WillReturnRows(sqlmock.NewRows([]string{"table_catalog", "table_schema", "table_name", "column_name", "constraint_name", "constraint_type"}).AddRow("app", "public", "people", "id", "people_pkey", "PRIMARY KEY"))
	objects, err := MetadataSQL(context.Background(), database, PostgreSQL, "app")
	if err != nil {
		t.Fatal(err)
	}
	for _, object := range objects {
		if object.Kind == "key" && object.Parent == "people" && object.Name == "id" {
			return
		}
	}
	t.Fatalf("key object missing: %+v", objects)
}

func TestMetadataUsesMySQLKeyQueryShape(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("information_schema.columns").WithArgs("fim").WillReturnRows(sqlmock.NewRows([]string{"table_catalog", "table_schema", "table_name", "column_name", "data_type", "is_nullable"}).
		AddRow("def", "fim", "users", "id", "bigint", "NO").
		AddRow("def", "fim", "users", "name", "varchar", "YES"))
	mock.ExpectQuery("information_schema.table_constraints").WithArgs("fim").WillReturnRows(sqlmock.NewRows([]string{"table_schema", "table_name", "column_name", "constraint_name", "constraint_type"}).
		AddRow("fim", "users", "id", "PRIMARY", "PRIMARY KEY"))
	objects, err := MetadataSQL(context.Background(), database, MySQL, "fim")
	if err != nil {
		t.Fatal(err)
	}
	tableCount := 0
	keyCount := 0
	for _, object := range objects {
		if object.Kind == "table" {
			tableCount++
			if object.Schema != "fim" || object.Name != "users" {
				t.Fatalf("unexpected table object: %+v", object)
			}
		}
		if object.Kind == "key" {
			keyCount++
			if object.Schema != "fim" || object.Parent != "users" || object.Name != "id" {
				t.Fatalf("unexpected key object: %+v", object)
			}
		}
	}
	if tableCount != 1 || keyCount != 1 {
		t.Fatalf("unexpected object counts: tables=%d keys=%d objects=%+v", tableCount, keyCount, objects)
	}
}

func TestMetadataReturnsEmptyListForRedis(t *testing.T) {
	objects, err := Metadata(context.Background(), &Handle{Driver: Redis, Config: ConnectionInput{Database: "0"}})
	if err != nil {
		t.Fatal(err)
	}
	if objects == nil {
		t.Fatal("expected non-nil empty slice for redis metadata")
	}
	if len(objects) != 0 {
		t.Fatalf("objects = %+v", objects)
	}
}
