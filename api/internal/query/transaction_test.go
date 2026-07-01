package query

import (
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestTransactionCommitIsScopedToOwner(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectBegin()
	mock.ExpectCommit()
	transactions := NewTransactionService(5 * time.Minute)
	id, err := transactions.Begin("owner", database)
	if err != nil {
		t.Fatal(err)
	}
	if err := transactions.Commit("other", id); !errors.Is(err, ErrTransactionNotFound) {
		t.Fatalf("cross-scope err=%v", err)
	}
	if err := transactions.Commit("owner", id); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTransactionRollbackRemovesTransaction(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectBegin()
	mock.ExpectRollback()
	transactions := NewTransactionService(time.Minute)
	id, err := transactions.Begin("owner", database)
	if err != nil {
		t.Fatal(err)
	}
	if err := transactions.Rollback("owner", id); err != nil {
		t.Fatal(err)
	}
	if _, ok := transactions.Get("owner", id); ok {
		t.Fatal("rolled back transaction remains")
	}
}
