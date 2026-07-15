package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/registry"
)

type fakeConnectionRegistry struct {
	principal        identity.Principal
	kind             string
	scope            string
	input            registry.SaveInput
	err              error
	secretPrincipal  identity.Principal
	secretID         string
	secretConnection registry.Connection
	secret           registry.Secret
	secretErr        error
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

func (f *fakeConnectionRegistry) SecretForUse(_ context.Context, p identity.Principal, id string) (registry.Connection, registry.Secret, error) {
	f.secretPrincipal = p
	f.secretID = id
	return f.secretConnection, f.secret, f.secretErr
}

func TestSavedDatabaseConnectionCreatesRuntimeSession(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{
		secretConnection: registry.Connection{
			ID: "conn_saved", Name: "Primary", Kind: "database", Driver: "postgres", Scope: "personal",
			Endpoint: raw(`{"host":"db.internal","port":5432}`),
			Config:   raw(`{"database":"app","tlsMode":"prefer"}`),
		},
		secret: registry.Secret{Username: "ops", Password: "top-secret"},
	}
	var opened database.ConnectionInput
	router, authSessions, _, runtimeSessions := newAuthTestRouterWithRegistryDependencies(t, true, fakeRegistry, func(deps *Dependencies) {
		deps.ValidateDestination = func(_ context.Context, host string, port uint16) error {
			if host != "db.internal" || port != 5432 {
				t.Fatalf("destination = %s:%d", host, port)
			}
			return nil
		}
		deps.OpenHandle = func(_ context.Context, input database.ConnectionInput) (*database.Handle, error) {
			opened = input
			return &database.Handle{Driver: database.PostgreSQL, Config: input}, nil
		}
	})
	loginSession := createAuthSession(t, authSessions)
	workbenchSession := runtimeSessions.CreateSession()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
	req.Header.Set("X-Session-ID", workbenchSession)
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	if fakeRegistry.secretPrincipal.User.ID != "usr_alice" || fakeRegistry.secretID != "conn_saved" {
		t.Fatalf("principal = %+v id = %q", fakeRegistry.secretPrincipal, fakeRegistry.secretID)
	}
	if opened.Driver != database.PostgreSQL || opened.Host != "db.internal" || opened.Port != 5432 || opened.Database != "app" || opened.User != "ops" || opened.Password != "top-secret" || opened.TLSMode != "prefer" {
		t.Fatalf("opened = %+v", opened)
	}
	if strings.Contains(rr.Body.String(), "top-secret") || strings.Contains(rr.Body.String(), "ops") {
		t.Fatalf("secret leaked: %s", rr.Body.String())
	}
	var response struct {
		ConnectionID string `json:"connectionId"`
		Database     string `json:"database"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.ConnectionID == "" || response.Database != "app" {
		t.Fatalf("response = %+v", response)
	}
	if _, ok := runtimeSessions.GetHandle(workbenchSession, response.ConnectionID); !ok {
		t.Fatal("opened handle was not stored in the workbench session")
	}
}

func TestSavedDatabaseConnectionRejectsInvalidAccessAndKinds(t *testing.T) {
	tests := []struct {
		name       string
		registry   *fakeConnectionRegistry
		wantStatus int
		wantCode   string
	}{
		{name: "inaccessible", registry: &fakeConnectionRegistry{secretErr: registry.ErrForbidden}, wantStatus: http.StatusForbidden, wantCode: "forbidden"},
		{name: "missing", registry: &fakeConnectionRegistry{secretErr: registry.ErrNotFound}, wantStatus: http.StatusNotFound, wantCode: "connection_not_found"},
		{name: "ssh", registry: &fakeConnectionRegistry{secretConnection: registry.Connection{ID: "conn_ssh", Kind: "ssh", Driver: "ssh"}}, wantStatus: http.StatusBadRequest, wantCode: "invalid_connection_kind"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router, authSessions, _, runtimeSessions := newAuthTestRouterWithRegistryDependencies(t, true, tt.registry, nil)
			loginSession := createAuthSession(t, authSessions)
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
			req.Header.Set("X-Session-ID", runtimeSessions.CreateSession())
			req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
			req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
			router.ServeHTTP(rr, req)
			if rr.Code != tt.wantStatus {
				t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
			}
			assertErrorCode(t, rr.Body.String(), tt.wantCode)
		})
	}
}

func TestSavedDatabaseConnectionRequiresLoginAndWorkbenchSession(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{}
	router, authSessions, _, runtimeSessions := newAuthTestRouterWithRegistryDependencies(t, true, fakeRegistry, nil)
	loginSession := createAuthSession(t, authSessions)

	t.Run("login", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
		req.Header.Set("X-Session-ID", runtimeSessions.CreateSession())
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
		}
		assertErrorCode(t, rr.Body.String(), "auth_required")
	})

	t.Run("workbench session", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
		req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
		req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
		}
		assertErrorCode(t, rr.Body.String(), "invalid_session")
	})
}

func TestSavedDatabaseConnectionRejectsDestinationWithoutOpeningSecret(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{
		secretConnection: registry.Connection{ID: "conn_saved", Kind: "database", Driver: "mysql", Endpoint: raw(`{"host":"blocked.internal","port":3306}`), Config: raw(`{"database":"app"}`)},
		secret:           registry.Secret{Username: "ops", Password: "top-secret"},
	}
	opened := false
	router, authSessions, _, runtimeSessions := newAuthTestRouterWithRegistryDependencies(t, true, fakeRegistry, func(deps *Dependencies) {
		deps.ValidateDestination = func(context.Context, string, uint16) error { return errors.New("blocked") }
		deps.OpenHandle = func(context.Context, database.ConnectionInput) (*database.Handle, error) {
			opened = true
			return nil, errors.New("must not open")
		}
	})
	loginSession := createAuthSession(t, authSessions)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
	req.Header.Set("X-Session-ID", runtimeSessions.CreateSession())
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest || opened {
		t.Fatalf("status = %d opened = %v body = %s", rr.Code, opened, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "destination_invalid")
	if strings.Contains(rr.Body.String(), "top-secret") {
		t.Fatalf("secret leaked: %s", rr.Body.String())
	}
}

func TestSavedDatabaseConnectionRedactsDriverErrors(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{
		secretConnection: registry.Connection{ID: "conn_saved", Kind: "database", Driver: "postgres", Endpoint: raw(`{"host":"db.internal","port":5432}`), Config: raw(`{}`)},
		secret:           registry.Secret{Username: "ops", Password: "top-secret"},
	}
	router, authSessions, _, runtimeSessions := newAuthTestRouterWithRegistryDependencies(t, true, fakeRegistry, func(deps *Dependencies) {
		deps.OpenHandle = func(context.Context, database.ConnectionInput) (*database.Handle, error) {
			return nil, errors.New("password top-secret rejected for ops")
		}
	})
	loginSession := createAuthSession(t, authSessions)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
	req.Header.Set("X-Session-ID", runtimeSessions.CreateSession())
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "connection_failed")
	if strings.Contains(rr.Body.String(), "top-secret") || strings.Contains(rr.Body.String(), "ops") {
		t.Fatalf("driver error leaked credentials: %s", rr.Body.String())
	}
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

func TestConnectionRegistryMapsDuplicateNameToConflict(t *testing.T) {
	fakeRegistry := &fakeConnectionRegistry{err: registry.ErrConflict}
	router, sessions, _ := newAuthTestRouterWithRegistry(t, true, fakeRegistry)
	loginSession := createAuthSession(t, sessions)

	body := `{"connection":{"id":"conn_duplicate","name":"Main","kind":"ssh","driver":"ssh","scope":"personal","endpoint":{"host":"bastion","port":22},"config":{}},"secret":{"username":"ops","password":"secret"}}`
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "connection_name_conflict")
	if !strings.Contains(rr.Body.String(), "同类型连接中已存在") {
		t.Fatalf("body = %s", rr.Body.String())
	}
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
