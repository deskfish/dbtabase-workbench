package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/registry"
)

type fakeConnectionRegistry struct {
	principal identity.Principal
	kind      string
	scope     string
	input     registry.SaveInput
	err       error
}

func (f *fakeConnectionRegistry) List(_ context.Context, p identity.Principal, kind, scope string) ([]registry.Connection, error) {
	f.principal = p
	f.kind = kind
	f.scope = scope
	return []registry.Connection{{ID: "conn_one", Name: "Main", Kind: "database", Driver: "postgres", Scope: "personal", OwnerUserID: p.User.ID, Endpoint: raw(`{"host":"db.local","port":5432}`), Config: raw(`{}`), HasSecret: true}}, f.err
}

func (f *fakeConnectionRegistry) Create(_ context.Context, p identity.Principal, input registry.SaveInput) (registry.Connection, error) {
	f.principal = p
	f.input = input
	if f.err != nil {
		return registry.Connection{}, f.err
	}
	input.Connection.OwnerUserID = p.User.ID
	input.Connection.HasSecret = input.Secret != nil
	return input.Connection, nil
}

func (f *fakeConnectionRegistry) Update(_ context.Context, p identity.Principal, _ string, input registry.SaveInput) (registry.Connection, error) {
	f.principal = p
	f.input = input
	if f.err != nil {
		return registry.Connection{}, f.err
	}
	input.Connection.HasSecret = true
	return input.Connection, nil
}

func (f *fakeConnectionRegistry) Delete(_ context.Context, p identity.Principal, _ string) error {
	f.principal = p
	return f.err
}

func TestConnectionRegistryListUsesAuthenticatedPrincipalAndFilters(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{}
	router, sessions, _ := newAuthTestRouterWithRegistry(t, true, fakeRegistry)
	loginSession := createAuthSession(t, sessions)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/registry/v2/connections?kind=database&scope=personal", nil)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	if fakeRegistry.principal.User.ID != "usr_alice" || fakeRegistry.kind != "database" || fakeRegistry.scope != "personal" {
		t.Fatalf("principal=%+v kind=%q scope=%q", fakeRegistry.principal, fakeRegistry.kind, fakeRegistry.scope)
	}
	if strings.Contains(strings.ToLower(rr.Body.String()), "password") || strings.Contains(strings.ToLower(rr.Body.String()), "ciphertext") {
		t.Fatalf("secret leaked in list body: %s", rr.Body.String())
	}
}

func TestConnectionRegistryCreateValidatesAndOmitsSecret(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{}
	router, sessions, _ := newAuthTestRouterWithRegistry(t, true, fakeRegistry)
	loginSession := createAuthSession(t, sessions)

	body := `{"connection":{"id":"conn_new","name":"Main","kind":"database","driver":"postgres","scope":"personal","endpoint":{"host":"db.local","port":5432},"config":{}},"secret":{"username":"ops","password":"secret"}}`
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	if fakeRegistry.input.Secret == nil || fakeRegistry.input.Secret.Password != "secret" {
		t.Fatalf("input = %+v", fakeRegistry.input)
	}
	if strings.Contains(rr.Body.String(), "secret") || strings.Contains(strings.ToLower(rr.Body.String()), "password") {
		t.Fatalf("secret leaked in create body: %s", rr.Body.String())
	}
}

func TestConnectionRegistryMapsTeamDenial(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{err: registry.ErrForbidden}
	router, sessions, _ := newAuthTestRouterWithRegistry(t, true, fakeRegistry)
	loginSession := createAuthSession(t, sessions)

	body := `{"connection":{"id":"conn_team","name":"Team","kind":"ssh","driver":"ssh","scope":"team","teamId":"team_denied","endpoint":{"host":"bastion","port":22},"config":{}},"secret":{"username":"ops","privateKey":"key"}}`
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "forbidden")
}

func TestConnectionRegistryRejectsUnknownFieldsWithRequestID(t *testing.T) {
	router, sessions, _ := newAuthTestRouterWithRegistry(t, true, &fakeConnectionRegistry{})
	loginSession := createAuthSession(t, sessions)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections", strings.NewReader(`{"connection":{},"secret":{},"extra":true}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "invalid_json")
	requestID := rr.Header().Get("X-Request-ID")
	if requestID == "" || !strings.Contains(rr.Body.String(), requestID) {
		t.Fatalf("request id header=%q body=%s", requestID, rr.Body.String())
	}
}

func TestConnectionRegistryValidation(t *testing.T) {
	router, sessions, _ := newAuthTestRouterWithRegistry(t, true, &fakeConnectionRegistry{})
	loginSession := createAuthSession(t, sessions)

	tests := []struct {
		name string
		body string
	}{
		{name: "driver kind mismatch", body: `{"connection":{"id":"c","name":"Bad","kind":"database","driver":"ssh","scope":"personal","endpoint":{"host":"db","port":5432},"config":{}},"secret":{"username":"u"}}`},
		{name: "missing host", body: `{"connection":{"id":"c","name":"Bad","kind":"database","driver":"postgres","scope":"personal","endpoint":{"port":5432},"config":{}},"secret":{"username":"u"}}`},
		{name: "missing team", body: `{"connection":{"id":"c","name":"Bad","kind":"ssh","driver":"ssh","scope":"team","endpoint":{"host":"b","port":22},"config":{}},"secret":{"username":"u"}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
			req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
			router.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
			}
		})
	}
}

func createAuthSession(t *testing.T, sessions *identity.Sessions) identity.LoginSession {
	t.Helper()
	loginSession, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}
	return loginSession
}

func raw(value string) json.RawMessage {
	return json.RawMessage(value)
}

var _ ConnectionRegistry = (*fakeConnectionRegistry)(nil)
