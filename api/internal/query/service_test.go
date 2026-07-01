package query

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestServicePaginatesRows(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	rows := sqlmock.NewRows([]string{"id", "name"})
	for i := 0; i < 201; i++ {
		rows.AddRow(i, fmt.Sprintf("row-%d", i))
	}
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	service := NewService(Limits{Timeout: time.Second, PageSize: 200, MaxRows: 10_000})
	id := service.Start("session/connection", database, "SELECT id, name FROM items")
	result := waitResult(t, service, "session/connection", id, 0)
	if len(result.Rows) != 200 || result.NextCursor != 200 {
		t.Fatalf("rows=%d next=%d", len(result.Rows), result.NextCursor)
	}
	second, err := service.Result("session/connection", id, result.NextCursor)
	if err != nil || len(second.Rows) != 1 || second.NextCursor != 0 {
		t.Fatalf("second=%+v err=%v", second, err)
	}
}

func TestServiceScopesQueryIDs(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(1))
	service := NewService(Limits{Timeout: time.Second, PageSize: 200, MaxRows: 10_000})
	id := service.Start("owner", database, "SELECT 1")
	_ = waitResult(t, service, "owner", id, 0)
	if _, err := service.Result("other", id, 0); !errors.Is(err, ErrQueryNotFound) {
		t.Fatalf("err=%v", err)
	}
}

func TestServiceCancelsRunningQuery(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("SELECT").WillDelayFor(time.Second).WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(1))
	service := NewService(Limits{Timeout: 2 * time.Second, PageSize: 200, MaxRows: 10_000})
	id := service.Start("owner", database, "SELECT slow")
	if err := service.Cancel("owner", id); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		_, err := service.Result("owner", id, 0)
		if errors.Is(err, context.Canceled) {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("query did not report cancellation")
}

func TestServiceExportsRFC4180CSV(t *testing.T) {
	database, mock, _ := sqlmock.New()
	defer database.Close()
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows([]string{"name", "note"}).AddRow("Ada", "hello, \"world\""))
	service := NewService(Limits{Timeout: time.Second, PageSize: 200, MaxRows: 10_000})
	id := service.Start("owner", database, "SELECT name, note FROM people")
	_ = waitResult(t, service, "owner", id, 0)
	var output bytes.Buffer
	if err := service.ExportCSV("owner", id, &output); err != nil {
		t.Fatal(err)
	}
	want := "\ufeffname,note\r\nAda,\"hello, \"\"world\"\"\"\r\n"
	if output.String() != want {
		t.Fatalf("CSV = %q", output.String())
	}
}

func waitResult(t *testing.T, service *Service, scope, id string, cursor int) ResultPage {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		result, err := service.Result(scope, id, cursor)
		if err == nil {
			return result
		}
		if !errors.Is(err, ErrQueryPending) {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("query did not finish")
	return ResultPage{}
}
