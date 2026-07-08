package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthMiddlewareAllowsPublicHealthAndLogin(t *testing.T) {
	router, _, _ := newAuthTestRouter(t, true)

	health := httptest.NewRecorder()
	router.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/health/live", nil))
	if health.Code != http.StatusOK {
		t.Fatalf("health status = %d", health.Code)
	}

	login := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"alice","password":"password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(login, req)
	if login.Code != http.StatusOK {
		t.Fatalf("login status = %d body = %s", login.Code, login.Body.String())
	}
}

func TestAuthMiddlewareRequiresCookie(t *testing.T) {
	router, _, _ := newAuthTestRouter(t, true)

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/sessions", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "auth_required")
}

func TestAuthMiddlewareInjectsPrincipalForSessionEndpoint(t *testing.T) {
	router, sessions, _ := newAuthTestRouter(t, true)
	loginSession, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	var body struct {
		User      userResponse      `json:"user"`
		Teams     map[string]string `json:"teams"`
		CSRFToken string            `json:"csrfToken"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.User.ID != "usr_alice" || body.Teams["team_one"] != "admin" || body.CSRFToken != loginSession.CSRFToken {
		t.Fatalf("body = %+v", body)
	}
}

func TestAuthMiddlewareEnforcesCSRFForUnsafeMethods(t *testing.T) {
	router, sessions, _ := newAuthTestRouter(t, true)
	loginSession, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run(method+" missing csrf", func(t *testing.T) {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(method, "/api/auth/session", nil)
			req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
			router.ServeHTTP(rr, req)
			if rr.Code != http.StatusForbidden {
				t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
			}
			assertErrorCode(t, rr.Body.String(), "csrf_invalid")
		})

		t.Run(method+" exact csrf passes middleware", func(t *testing.T) {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(method, "/api/auth/session", nil)
			req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
			req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
			router.ServeHTTP(rr, req)
			if rr.Code == http.StatusForbidden || rr.Code == http.StatusUnauthorized {
				t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
			}
		})
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("safe GET status = %d body = %s", rr.Code, rr.Body.String())
	}
}
