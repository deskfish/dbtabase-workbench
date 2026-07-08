package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"dbworkbench/api/internal/identity"
)

type IdentityService interface {
	Authenticate(context.Context, string, string) (identity.User, error)
	PrincipalForUser(context.Context, string) (identity.Principal, error)
}

type userResponse struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	SystemRole  string `json:"systemRole"`
	Disabled    bool   `json:"disabled"`
}

func registerAuthRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		user, err := deps.Identity.Authenticate(r.Context(), input.Username, input.Password)
		if errors.Is(err, identity.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "用户名或密码错误")
			return
		}
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "auth_unavailable", "认证服务不可用")
			return
		}
		session, err := deps.AuthSessions.Create(r.Context(), user.ID)
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "auth_unavailable", "认证服务不可用")
			return
		}
		setAuthCookie(w, deps, session.ID)
		writeJSON(w, http.StatusOK, map[string]any{
			"user":      toUserResponse(user),
			"csrfToken": session.CSRFToken,
		})
	})

	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if session, ok := identity.LoginSessionFromContext(r.Context()); ok {
			if err := deps.AuthSessions.Delete(r.Context(), session.ID); err != nil {
				writeError(w, http.StatusServiceUnavailable, "auth_unavailable", "认证服务不可用")
				return
			}
		}
		clearAuthCookie(w, deps)
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := identity.PrincipalFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "auth_required", "需要登录")
			return
		}
		session, ok := identity.LoginSessionFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "auth_required", "需要登录")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"user":      toUserResponse(principal.User),
			"teams":     principal.Teams,
			"csrfToken": session.CSRFToken,
		})
	})
}

func setAuthCookie(w http.ResponseWriter, deps Dependencies, sessionID string) {
	ttl := authSessionTTL(deps)
	http.SetCookie(w, &http.Cookie{
		Name:     authCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   deps.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(ttl.Seconds()),
		Expires:  time.Now().Add(ttl),
	})
}

func clearAuthCookie(w http.ResponseWriter, deps Dependencies) {
	http.SetCookie(w, &http.Cookie{
		Name:     authCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   deps.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func authSessionTTL(deps Dependencies) time.Duration {
	if deps.AuthSessionTTL > 0 {
		return deps.AuthSessionTTL
	}
	return 12 * time.Hour
}

func toUserResponse(user identity.User) userResponse {
	return userResponse{
		ID:          user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		SystemRole:  user.SystemRole,
		Disabled:    user.Disabled,
	}
}
