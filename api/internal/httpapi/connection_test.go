package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dbworkbench/api/internal/session"
)

func TestCreateSessionReturnsOpaqueToken(t *testing.T) {
	h := NewRouter(Dependencies{Ready: func() bool { return true }, Sessions: session.NewStore(time.Minute)})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/sessions", nil))
	if rr.Code != http.StatusCreated || !strings.Contains(rr.Body.String(), "sessionId") {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestCreateConnectionRequiresValidSession(t *testing.T) {
	h := NewRouter(Dependencies{Ready: func() bool { return true }, Sessions: session.NewStore(time.Minute)})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/connections", strings.NewReader(`{"driver":"mysql"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}
