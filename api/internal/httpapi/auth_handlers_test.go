package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dbworkbench/api/internal/identity"
)

func TestAuthLoginSetsStrictCookieAndReturnsCSRF(t *testing.T) {
	router, _, _ := newAuthTestRouter(t, true)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"alice","password":"password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	cookie := findCookie(rr.Result().Cookies(), authCookieName)
	if cookie == nil {
		t.Fatal("missing ops_session cookie")
	}
	if !cookie.HttpOnly || !cookie.Secure || cookie.Path != "/" || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge != 3600 {
		t.Fatalf("cookie = %+v", cookie)
	}
	var body struct {
		User      userResponse `json:"user"`
		CSRFToken string       `json:"csrfToken"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.User.Username != "alice" || body.CSRFToken == "" {
		t.Fatalf("body = %+v", body)
	}
}

func TestAuthLoginUsesSingleInvalidCredentialsResponse(t *testing.T) {
	router, _, fake := newAuthTestRouter(t, true)
	fake.authErr = identity.ErrInvalidCredentials

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"alice","password":"wrong"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "invalid_credentials")
}

func TestAuthLoginRejectsUnknownJSONFields(t *testing.T) {
	router, _, _ := newAuthTestRouter(t, true)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"alice","password":"password","extra":true}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	assertErrorCode(t, rr.Body.String(), "invalid_json")
}

func TestAuthLogoutDeletesSessionAndExpiresCookie(t *testing.T) {
	router, sessions, _ := newAuthTestRouter(t, true)
	loginSession, err := sessions.Create(context.Background(), "usr_alice")
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status = %d body = %s", rr.Code, rr.Body.String())
	}
	if _, err := sessions.Get(context.Background(), loginSession.ID); !errors.Is(err, identity.ErrSessionNotFound) {
		t.Fatalf("session err = %v, want %v", err, identity.ErrSessionNotFound)
	}
	cookie := findCookie(rr.Result().Cookies(), authCookieName)
	if cookie == nil || cookie.MaxAge >= 0 {
		t.Fatalf("expired cookie = %+v", cookie)
	}
}

func TestUserAndTeamAdminRoutes(t *testing.T) {
	router, sessions, fake := newAuthTestRouter(t, true)
	loginSession := createAuthSession(t, sessions)

	userBody := `{"username":"new-user","displayName":"New User","password":"password","role":"member"}`
	userRR := httptest.NewRecorder()
	userReq := httptest.NewRequest(http.MethodPost, "/api/users", strings.NewReader(userBody))
	userReq.Header.Set("Content-Type", "application/json")
	userReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	userReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(userRR, userReq)
	if userRR.Code != http.StatusCreated {
		t.Fatalf("user status = %d body = %s", userRR.Code, userRR.Body.String())
	}
	if fake.createdUser.Username != "new-user" || strings.Contains(strings.ToLower(userRR.Body.String()), "password") {
		t.Fatalf("created user=%+v body=%s", fake.createdUser, userRR.Body.String())
	}

	teamBody := `{"name":"New Team"}`
	teamRR := httptest.NewRecorder()
	teamReq := httptest.NewRequest(http.MethodPost, "/api/teams", strings.NewReader(teamBody))
	teamReq.Header.Set("Content-Type", "application/json")
	teamReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	teamReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(teamRR, teamReq)
	if teamRR.Code != http.StatusCreated {
		t.Fatalf("team status = %d body = %s", teamRR.Code, teamRR.Body.String())
	}
	if fake.createdTeam.Name != "New Team" {
		t.Fatalf("created team=%+v", fake.createdTeam)
	}

	membersRR := httptest.NewRecorder()
	membersReq := httptest.NewRequest(http.MethodPost, "/api/teams/team_one/members", strings.NewReader(`{"userId":"usr_bob","role":"member"}`))
	membersReq.Header.Set("Content-Type", "application/json")
	membersReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	membersReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(membersRR, membersReq)
	if membersRR.Code != http.StatusNoContent {
		t.Fatalf("member status = %d body = %s", membersRR.Code, membersRR.Body.String())
	}
	if fake.addedTeamID != "team_one" || fake.addedTeamUserID != "usr_bob" || fake.addedTeamRole != "member" {
		t.Fatalf("member mutation team=%q user=%q role=%q", fake.addedTeamID, fake.addedTeamUserID, fake.addedTeamRole)
	}

	listRR := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	listReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(listRR, listReq)
	if listRR.Code != http.StatusOK || !strings.Contains(listRR.Body.String(), "Team One") {
		t.Fatalf("teams status = %d body = %s", listRR.Code, listRR.Body.String())
	}
}
