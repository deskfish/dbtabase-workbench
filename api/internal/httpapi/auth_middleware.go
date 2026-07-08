package httpapi

import (
	"errors"
	"net/http"

	"dbworkbench/api/internal/identity"
)

const authCookieName = "ops_session"

func authMiddleware(next http.Handler, deps Dependencies) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicAuthPath(r) {
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie(authCookieName)
		if err != nil || cookie.Value == "" {
			writeError(w, http.StatusUnauthorized, "auth_required", "需要登录")
			return
		}
		session, err := deps.AuthSessions.Get(r.Context(), cookie.Value)
		if errors.Is(err, identity.ErrSessionNotFound) {
			writeError(w, http.StatusUnauthorized, "auth_required", "需要登录")
			return
		}
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "auth_unavailable", "认证服务不可用")
			return
		}

		principal, err := deps.Identity.PrincipalForUser(r.Context(), session.UserID)
		if err != nil || principal.User.Disabled {
			_ = deps.AuthSessions.Delete(r.Context(), session.ID)
			writeError(w, http.StatusUnauthorized, "auth_required", "需要登录")
			return
		}

		if !csrfSafeMethod(r.Method) && r.Header.Get("X-CSRF-Token") != session.CSRFToken {
			writeError(w, http.StatusForbidden, "csrf_invalid", "CSRF token 无效")
			return
		}

		ctx := identity.WithPrincipal(r.Context(), principal)
		ctx = identity.WithLoginSession(ctx, session)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func isPublicAuthPath(r *http.Request) bool {
	switch {
	case r.Method == http.MethodGet && (r.URL.Path == "/health/live" || r.URL.Path == "/health/ready"):
		return true
	case r.Method == http.MethodPost && r.URL.Path == "/api/auth/login":
		return true
	default:
		return false
	}
}

func csrfSafeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}
