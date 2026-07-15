package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLegacyRegistryRouteIsNotRegistered(t *testing.T) {
	router := NewRouter(Dependencies{})
	req := httptest.NewRequest(http.MethodGet, "/api/registry/personal/connections", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
}
