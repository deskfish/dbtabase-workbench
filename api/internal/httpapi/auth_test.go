package httpapi

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"dbworkbench/api/internal/identity"
	connectionSession "dbworkbench/api/internal/session"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

type fakeIdentity struct {
	user             identity.User
	principal        identity.Principal
	authErr          error
	createdUser      identity.User
	updatedUser      identity.User
	userTeamsUserID  string
	userTeams        []identity.TeamAssignment
	createdTeam      identity.Team
	updatedTeam      identity.Team
	deletedTeamID    string
	deletedUserID    string
	addedTeamID      string
	addedTeamUserID  string
	addedTeamRole    string
	memberRoleTeamID string
	memberRoleUserID string
	memberRole       string
	removedTeamID    string
	removedUserID    string
	listedTeamID     string
}

func (f *fakeIdentity) Authenticate(context.Context, string, string) (identity.User, error) {
	if f.authErr != nil {
		return identity.User{}, f.authErr
	}
	return f.user, nil
}

func (f *fakeIdentity) PrincipalForUser(context.Context, string) (identity.Principal, error) {
	return f.principal, nil
}

func (f *fakeIdentity) ListUsers(context.Context, identity.Principal) ([]identity.User, error) {
	return []identity.User{f.user}, nil
}

func (f *fakeIdentity) ListTeams(context.Context, identity.Principal) ([]identity.Team, error) {
	return []identity.Team{{ID: "team_one", Name: "Team One", Role: "admin"}}, nil
}

func (f *fakeIdentity) CreateUser(_ context.Context, _ identity.Principal, username, displayName, _ string, role string) (identity.User, error) {
	f.createdUser = identity.User{ID: "usr_created", Username: username, DisplayName: displayName, SystemRole: role}
	return f.createdUser, nil
}

func (f *fakeIdentity) UpdateUser(_ context.Context, _ identity.Principal, userID string, update identity.UserUpdate) (identity.User, error) {
	displayName := "updated"
	if update.DisplayName != nil {
		displayName = *update.DisplayName
	}
	role := "member"
	if update.SystemRole != nil {
		role = *update.SystemRole
	}
	disabled := false
	if update.Disabled != nil {
		disabled = *update.Disabled
	}
	f.updatedUser = identity.User{ID: userID, Username: "updated", DisplayName: displayName, SystemRole: role, Disabled: disabled}
	return f.updatedUser, nil
}

func (f *fakeIdentity) DeleteUser(_ context.Context, _ identity.Principal, userID string) error {
	f.deletedUserID = userID
	return nil
}

func (f *fakeIdentity) SetUserTeamMemberships(_ context.Context, _ identity.Principal, userID string, teams []identity.TeamAssignment) error {
	f.userTeamsUserID = userID
	f.userTeams = append([]identity.TeamAssignment(nil), teams...)
	return nil
}

func (f *fakeIdentity) CreateTeam(_ context.Context, _ identity.Principal, name string) (identity.Team, error) {
	f.createdTeam = identity.Team{ID: "team_created", Name: name, Role: "admin"}
	return f.createdTeam, nil
}

func (f *fakeIdentity) UpdateTeam(_ context.Context, _ identity.Principal, teamID, name string) (identity.Team, error) {
	f.updatedTeam = identity.Team{ID: teamID, Name: name, Role: "admin"}
	return f.updatedTeam, nil
}

func (f *fakeIdentity) DeleteTeam(_ context.Context, _ identity.Principal, teamID string) error {
	f.deletedTeamID = teamID
	return nil
}

func (f *fakeIdentity) AddTeamMember(_ context.Context, _ identity.Principal, teamID, userID, role string) error {
	f.addedTeamID = teamID
	f.addedTeamUserID = userID
	f.addedTeamRole = role
	return nil
}

func (f *fakeIdentity) SetTeamMemberRole(_ context.Context, _ identity.Principal, teamID, userID, role string) error {
	f.memberRoleTeamID = teamID
	f.memberRoleUserID = userID
	f.memberRole = role
	return nil
}

func (f *fakeIdentity) RemoveTeamMember(_ context.Context, _ identity.Principal, teamID, userID string) error {
	f.removedTeamID = teamID
	f.removedUserID = userID
	return nil
}

func (f *fakeIdentity) ListTeamMembers(_ context.Context, _ identity.Principal, teamID string) ([]identity.TeamMember, error) {
	f.listedTeamID = teamID
	return []identity.TeamMember{{
		User: identity.User{ID: "usr_alice", Username: "alice", DisplayName: "Alice", SystemRole: "admin"},
		Role: "admin",
	}}, nil
}

func newAuthTestRouter(t *testing.T, secureCookie bool) (http.Handler, *identity.Sessions, *fakeIdentity) {
	return newAuthTestRouterWithRegistry(t, secureCookie, nil)
}

func newAuthTestRouterWithRegistry(t *testing.T, secureCookie bool, connections ConnectionRegistry) (http.Handler, *identity.Sessions, *fakeIdentity) {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	sessions := identity.NewSessions(client, time.Hour)
	fake := &fakeIdentity{
		user: identity.User{ID: "usr_alice", Username: "alice", DisplayName: "Alice", SystemRole: "admin"},
		principal: identity.Principal{
			User:  identity.User{ID: "usr_alice", Username: "alice", DisplayName: "Alice", SystemRole: "admin"},
			Teams: map[string]string{"team_one": "admin"},
		},
	}
	router := NewRouter(Dependencies{
		Sessions:           connectionSession.NewStore(time.Minute),
		Identity:           fake,
		AuthSessions:       sessions,
		AuthSessionTTL:     time.Hour,
		CookieSecure:       secureCookie,
		ConnectionRegistry: connections,
	})
	return router, sessions, fake
}

func findCookie(cookies []*http.Cookie, name string) *http.Cookie {
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

func assertErrorCode(t *testing.T, body, code string) {
	t.Helper()
	if !strings.Contains(body, `"code":"`+code+`"`) {
		t.Fatalf("body = %s, want error code %s", body, code)
	}
}
