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
	objects, err := Metadata(context.Background(), database, PostgreSQL)
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
