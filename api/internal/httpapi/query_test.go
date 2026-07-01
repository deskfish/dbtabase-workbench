package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dbworkbench/api/internal/query"
	"dbworkbench/api/internal/session"
)

func TestDangerousQueryRequiresConfirmation(t *testing.T) {
	store := session.NewStore(time.Minute)
	sessionID := store.CreateSession()
	connectionID := store.PutConnection(sessionID, nil, "postgres")
	h := NewRouter(Dependencies{Ready: func() bool { return true }, Sessions: store, Queries: query.NewService(query.Limits{})})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/connections/"+connectionID+"/queries", strings.NewReader(`{"sql":"DELETE FROM invoices"}`))
	req.Header.Set("X-Session-ID", sessionID)
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusConflict || !strings.Contains(rr.Body.String(), "delete_without_where") {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDropConfirmationMustMatchTarget(t *testing.T) {
	store := session.NewStore(time.Minute)
	sessionID := store.CreateSession()
	connectionID := store.PutConnection(sessionID, nil, "postgres")
	h := NewRouter(Dependencies{Ready: func() bool { return true }, Sessions: store, Queries: query.NewService(query.Limits{})})
	rr := httptest.NewRecorder()
	body := `{"sql":"DROP TABLE invoices","confirmed":true,"confirmationTarget":"other"}`
	req := httptest.NewRequest(http.MethodPost, "/api/connections/"+connectionID+"/queries", strings.NewReader(body))
	req.Header.Set("X-Session-ID", sessionID)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}
