package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
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
	UpdateUser(context.Context, identity.Principal, string, identity.UserUpdate) (identity.User, error)
	DeleteUser(context.Context, identity.Principal, string) error
	SetUserTeamMemberships(context.Context, identity.Principal, string, []identity.TeamAssignment) error
	CreateTeam(context.Context, identity.Principal, string) (identity.Team, error)
	UpdateTeam(context.Context, identity.Principal, string, string) (identity.Team, error)
	DeleteTeam(context.Context, identity.Principal, string) error
	AddTeamMember(context.Context, identity.Principal, string, string, string) error
	SetTeamMemberRole(context.Context, identity.Principal, string, string, string) error
	RemoveTeamMember(context.Context, identity.Principal, string, string) error
	ListTeamMembers(context.Context, identity.Principal, string) ([]identity.TeamMember, error)
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

type teamMemberResponse struct {
	User userResponse `json:"user"`
	Role string       `json:"role"`
}

func registerUserTeamRoutes(mux *http.ServeMux, deps Dependencies) {
	service, ok := deps.Identity.(IdentityAdminService)
	if !ok {
		return
	}
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

	mux.HandleFunc("PATCH /api/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			DisplayName *string `json:"displayName"`
			Role        *string `json:"role"`
			Disabled    *bool   `json:"disabled"`
			Password    *string `json:"password"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		userID := r.PathValue("id")
		user, err := service.UpdateUser(r.Context(), principal, userID, identity.UserUpdate{
			DisplayName: input.DisplayName,
			SystemRole:  input.Role,
			Disabled:    input.Disabled,
			Password:    input.Password,
		})
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		if deps.AuthSessions != nil {
			if input.Disabled != nil && *input.Disabled {
				_ = deps.AuthSessions.DeleteUser(r.Context(), userID)
			} else if input.Password != nil && strings.TrimSpace(*input.Password) != "" {
				_ = deps.AuthSessions.DeleteUser(r.Context(), userID)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(user)})
	})

	mux.HandleFunc("DELETE /api/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		userID := r.PathValue("id")
		if err := service.DeleteUser(r.Context(), principal, userID); err != nil {
			writeIdentityError(w, err)
			return
		}
		if deps.AuthSessions != nil {
			_ = deps.AuthSessions.DeleteUser(r.Context(), userID)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("PUT /api/users/{id}/teams", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			Teams []identity.TeamAssignment `json:"teams"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if err := service.SetUserTeamMemberships(r.Context(), principal, r.PathValue("id"), input.Teams); err != nil {
			writeIdentityError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
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

	mux.HandleFunc("PATCH /api/teams/{id}", func(w http.ResponseWriter, r *http.Request) {
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
		team, err := service.UpdateTeam(r.Context(), principal, r.PathValue("id"), input.Name)
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"team": toTeamResponse(team)})
	})

	mux.HandleFunc("DELETE /api/teams/{id}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if err := service.DeleteTeam(r.Context(), principal, r.PathValue("id")); err != nil {
			writeIdentityError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
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

	mux.HandleFunc("PATCH /api/teams/{id}/members/{userId}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			Role string `json:"role"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if err := service.SetTeamMemberRole(r.Context(), principal, r.PathValue("id"), r.PathValue("userId"), input.Role); err != nil {
			writeIdentityError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("DELETE /api/teams/{id}/members/{userId}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if err := service.RemoveTeamMember(r.Context(), principal, r.PathValue("id"), r.PathValue("userId")); err != nil {
			writeIdentityError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/teams/{id}/members", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		members, err := service.ListTeamMembers(r.Context(), principal, r.PathValue("id"))
		if err != nil {
			writeIdentityError(w, err)
			return
		}
		items := make([]teamMemberResponse, 0, len(members))
		for _, member := range members {
			items = append(items, toTeamMemberResponse(member))
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": items})
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

func toTeamMemberResponse(member identity.TeamMember) teamMemberResponse {
	return teamMemberResponse{User: toUserResponse(member.User), Role: member.Role}
}

func writeIdentityError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, identity.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "没有权限")
	case errors.Is(err, identity.ErrLastTeamAdmin):
		writeError(w, http.StatusConflict, "last_team_admin", "该团队至少需要保留一名管理员")
	case errors.Is(err, identity.ErrLastSystemAdmin):
		writeError(w, http.StatusConflict, "last_system_admin", "系统至少需要保留一名未禁用的管理员")
	case errors.Is(err, identity.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", "记录已存在或发生冲突")
	case errors.Is(err, identity.ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid", "请求无效")
	case errors.Is(err, identity.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "记录不存在")
	default:
		writeError(w, http.StatusBadRequest, "identity_failed", err.Error())
	}
}
