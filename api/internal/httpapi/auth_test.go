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
	user      identity.User
	principal identity.Principal
	authErr   error
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

func newAuthTestRouter(t *testing.T, secureCookie bool) (http.Handler, *identity.Sessions, *fakeIdentity) {
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
		Sessions:       connectionSession.NewStore(time.Minute),
		Identity:       fake,
		AuthSessions:   sessions,
		AuthSessionTTL: time.Hour,
		CookieSecure:   secureCookie,
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
