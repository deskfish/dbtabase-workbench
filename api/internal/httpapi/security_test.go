package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dbworkbench/api/internal/session"
)

func TestSecurityHeadersAndRequestID(t *testing.T) {
	rr := httptest.NewRecorder()
	NewRouter(Dependencies{}).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/live", nil))
	for name, want := range map[string]string{"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"} {
		if got := rr.Header().Get(name); got != want {
			t.Fatalf("%s=%q", name, got)
		}
	}
	if rr.Header().Get("Content-Security-Policy") == "" || rr.Header().Get("X-Request-ID") == "" {
		t.Fatal("missing CSP or request ID")
	}
}

func TestRejectsOversizedJSONBody(t *testing.T) {
	store := session.NewStore(time.Minute)
	sessionID := store.CreateSession()
	body := strings.NewReader(`{"driver":"mysql","extra":"` + strings.Repeat("x", 2<<20) + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/connections", body)
	req.Header.Set("X-Session-ID", sessionID)
	rr := httptest.NewRecorder()
	NewRouter(Dependencies{Sessions: store}).ServeHTTP(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}
