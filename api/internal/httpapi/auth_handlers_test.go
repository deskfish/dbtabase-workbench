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

	membersListRR := httptest.NewRecorder()
	membersListReq := httptest.NewRequest(http.MethodGet, "/api/teams/team_one/members", nil)
	membersListReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(membersListRR, membersListReq)
	if membersListRR.Code != http.StatusOK || !strings.Contains(membersListRR.Body.String(), `"username":"alice"`) {
		t.Fatalf("members list status = %d body = %s", membersListRR.Code, membersListRR.Body.String())
	}
	if fake.listedTeamID != "team_one" {
		t.Fatalf("listed team id = %q", fake.listedTeamID)
	}

	listRR := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	listReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(listRR, listReq)
	if listRR.Code != http.StatusOK || !strings.Contains(listRR.Body.String(), "Team One") {
		t.Fatalf("teams status = %d body = %s", listRR.Code, listRR.Body.String())
	}
}

func TestUserAndTeamMutationRoutes(t *testing.T) {
	router, sessions, fake := newAuthTestRouter(t, true)
	loginSession := createAuthSession(t, sessions)

	userRR := httptest.NewRecorder()
	userReq := httptest.NewRequest(http.MethodPatch, "/api/users/usr_bob", strings.NewReader(`{"displayName":"Bobby","role":"admin"}`))
	userReq.Header.Set("Content-Type", "application/json")
	userReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	userReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(userRR, userReq)
	if userRR.Code != http.StatusOK || !strings.Contains(userRR.Body.String(), `"displayName":"Bobby"`) {
		t.Fatalf("user patch status = %d body = %s", userRR.Code, userRR.Body.String())
	}
	if fake.updatedUser.ID != "usr_bob" || fake.updatedUser.DisplayName != "Bobby" || fake.updatedUser.SystemRole != "admin" {
		t.Fatalf("updated user = %+v", fake.updatedUser)
	}

	userTeamsRR := httptest.NewRecorder()
	userTeamsReq := httptest.NewRequest(http.MethodPut, "/api/users/usr_bob/teams", strings.NewReader(`{"teams":[{"teamId":"team_one","role":"member"},{"teamId":"team_two","role":"admin"}]}`))
	userTeamsReq.Header.Set("Content-Type", "application/json")
	userTeamsReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	userTeamsReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(userTeamsRR, userTeamsReq)
	if userTeamsRR.Code != http.StatusNoContent {
		t.Fatalf("user teams status = %d body = %s", userTeamsRR.Code, userTeamsRR.Body.String())
	}
	if fake.userTeamsUserID != "usr_bob" || len(fake.userTeams) != 2 || fake.userTeams[1].TeamID != "team_two" || fake.userTeams[1].Role != "admin" {
		t.Fatalf("user teams user=%q teams=%+v", fake.userTeamsUserID, fake.userTeams)
	}

	teamRR := httptest.NewRecorder()
	teamReq := httptest.NewRequest(http.MethodPatch, "/api/teams/team_one", strings.NewReader(`{"name":"Platform"}`))
	teamReq.Header.Set("Content-Type", "application/json")
	teamReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	teamReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(teamRR, teamReq)
	if teamRR.Code != http.StatusOK || fake.updatedTeam.Name != "Platform" {
		t.Fatalf("team patch status = %d team=%+v body=%s", teamRR.Code, fake.updatedTeam, teamRR.Body.String())
	}

	memberRR := httptest.NewRecorder()
	memberReq := httptest.NewRequest(http.MethodPatch, "/api/teams/team_one/members/usr_bob", strings.NewReader(`{"role":"admin"}`))
	memberReq.Header.Set("Content-Type", "application/json")
	memberReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	memberReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(memberRR, memberReq)
	if memberRR.Code != http.StatusNoContent {
		t.Fatalf("member patch status = %d body = %s", memberRR.Code, memberRR.Body.String())
	}
	if fake.memberRoleTeamID != "team_one" || fake.memberRoleUserID != "usr_bob" || fake.memberRole != "admin" {
		t.Fatalf("member role team=%q user=%q role=%q", fake.memberRoleTeamID, fake.memberRoleUserID, fake.memberRole)
	}

	removeRR := httptest.NewRecorder()
	removeReq := httptest.NewRequest(http.MethodDelete, "/api/teams/team_one/members/usr_bob", nil)
	removeReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	removeReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(removeRR, removeReq)
	if removeRR.Code != http.StatusNoContent || fake.removedTeamID != "team_one" || fake.removedUserID != "usr_bob" {
		t.Fatalf("member delete status = %d team=%q user=%q body=%s", removeRR.Code, fake.removedTeamID, fake.removedUserID, removeRR.Body.String())
	}

	deleteRR := httptest.NewRecorder()
	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/teams/team_one", nil)
	deleteReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	deleteReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(deleteRR, deleteReq)
	if deleteRR.Code != http.StatusNoContent || fake.deletedTeamID != "team_one" {
		t.Fatalf("team delete status = %d team=%q body=%s", deleteRR.Code, fake.deletedTeamID, deleteRR.Body.String())
	}
}
