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

type IdentityAdminService interface {
	IdentityService
	ListUsers(context.Context, identity.Principal) ([]identity.User, error)
	ListTeams(context.Context, identity.Principal) ([]identity.Team, error)
	CreateUser(context.Context, identity.Principal, string, string, string, string) (identity.User, error)
	CreateTeam(context.Context, identity.Principal, string) (identity.Team, error)
	AddTeamMember(context.Context, identity.Principal, string, string, string) error
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

type teamResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

func registerUserTeamRoutes(mux *http.ServeMux, service IdentityAdminService) {
	mux.HandleFunc("GET /api/users", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		users, err := service.ListUsers(r.Context(), principal)
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		items := make([]userResponse, 0, len(users))
		for _, user := range users {
			items = append(items, toUserResponse(user))
		}
		writeJSON(w, http.StatusOK, map[string]any{"users": items})
	})

	mux.HandleFunc("POST /api/users", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			Username    string `json:"username"`
			DisplayName string `json:"displayName"`
			Password    string `json:"password"`
			Role        string `json:"role"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		user, err := service.CreateUser(r.Context(), principal, input.Username, input.DisplayName, input.Password, input.Role)
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"user": toUserResponse(user)})
	})

	mux.HandleFunc("GET /api/teams", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		teams, err := service.ListTeams(r.Context(), principal)
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		items := make([]teamResponse, 0, len(teams))
		for _, team := range teams {
			items = append(items, toTeamResponse(team))
		}
		writeJSON(w, http.StatusOK, map[string]any{"teams": items})
	})

	mux.HandleFunc("POST /api/teams", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		team, err := service.CreateTeam(r.Context(), principal, input.Name)
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"team": toTeamResponse(team)})
	})

	mux.HandleFunc("POST /api/teams/{id}/members", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			UserID string `json:"userId"`
			Role   string `json:"role"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if err := service.AddTeamMember(r.Context(), principal, r.PathValue("id"), input.UserID, input.Role); err != nil {
			writeIdentityError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
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

func toTeamResponse(team identity.Team) teamResponse {
	return teamResponse{ID: team.ID, Name: team.Name, Role: team.Role}
}

func writeIdentityError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, identity.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "没有权限")
	case errors.Is(err, identity.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", "记录已存在")
	case errors.Is(err, identity.ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid", "请求无效")
	case errors.Is(err, identity.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "记录不存在")
	default:
		writeError(w, http.StatusBadRequest, "identity_failed", err.Error())
	}
}
