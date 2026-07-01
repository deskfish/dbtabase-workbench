package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLiveHealthEndpoint(t *testing.T) {
	h := NewRouter(Dependencies{Ready: func() bool { return true }})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/live", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d", rr.Code)
	}
	if rr.Body.String() != "{\"status\":\"ok\"}\n" {
		t.Fatalf("body = %q", rr.Body.String())
	}
}

func TestReadyHealthEndpointReportsUnavailable(t *testing.T) {
	h := NewRouter(Dependencies{Ready: func() bool { return false }})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", rr.Code)
	}
}
