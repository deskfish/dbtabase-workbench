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

func TestUpdateRowRejectsMissingUniqueKey(t *testing.T) {
	store := session.NewStore(time.Minute)
	sessionID := store.CreateSession()
	connectionID := store.PutConnection(sessionID, nil, "postgres")
	h := NewRouter(Dependencies{Ready: func() bool { return true }, Sessions: store, Transactions: query.NewTransactionService(time.Minute)})
	body := `{"schema":"public","table":"events","values":{"name":"x"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/connections/"+connectionID+"/rows/update", strings.NewReader(body))
	req.Header.Set("X-Session-ID", sessionID)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity || !strings.Contains(rr.Body.String(), "unique_key_required") {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}
