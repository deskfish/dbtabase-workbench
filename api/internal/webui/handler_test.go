package webui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestHandlerServesAssetsAndFallsBackToIndex(t *testing.T) {
	files := fstest.MapFS{
		"index.html":    {Data: []byte("<main>Ops Console</main>")},
		"assets/app.js": {Data: []byte("console.log('ops')")},
	}
	handler := Handler(files)
	for _, path := range []string{"/", "/connections", "/database/workspace/c1"} {
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
		if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "Ops Console") {
			t.Fatalf("path %s: %d %q", path, rr.Code, rr.Body.String())
		}
		if got := rr.Header().Get("Cache-Control"); got != "no-cache" {
			t.Fatalf("index cache control = %q", got)
		}
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "console.log") {
		t.Fatalf("asset: %d %q", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("asset cache control = %q", rr.Header().Get("Cache-Control"))
	}
}
