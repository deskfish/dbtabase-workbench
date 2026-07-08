package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/registry"
)

type ConnectionRegistry interface {
	List(context.Context, identity.Principal, string, string) ([]registry.Connection, error)
	Create(context.Context, identity.Principal, registry.SaveInput) (registry.Connection, error)
	Update(context.Context, identity.Principal, string, registry.SaveInput) (registry.Connection, error)
	Delete(context.Context, identity.Principal, string) error
}

func registerConnectionRegistryRoutes(mux *http.ServeMux, store ConnectionRegistry) {
	mux.HandleFunc("GET /api/registry/v2/connections", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		scope := strings.TrimSpace(r.URL.Query().Get("scope"))
		if !validOptionalKind(kind) || !validOptionalScope(scope) {
			writeError(w, http.StatusBadRequest, "invalid_filter", "连接筛选条件无效")
			return
		}
		connections, err := store.List(r.Context(), principal, kind, scope)
		if err != nil {
			writeConnectionRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": connections})
	})

	mux.HandleFunc("POST /api/registry/v2/connections", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input registry.SaveInput
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if err := validateConnectionInput(input.Connection); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_connection", err.Error())
			return
		}
		connection, err := store.Create(r.Context(), principal, input)
		if err != nil {
			writeConnectionRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"connection": connection})
	})

	mux.HandleFunc("PUT /api/registry/v2/connections/{id}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input registry.SaveInput
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if err := validateConnectionInput(input.Connection); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_connection", err.Error())
			return
		}
		connection, err := store.Update(r.Context(), principal, r.PathValue("id"), input)
		if err != nil {
			writeConnectionRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connection": connection})
	})

	mux.HandleFunc("DELETE /api/registry/v2/connections/{id}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if err := store.Delete(r.Context(), principal, r.PathValue("id")); err != nil {
			writeConnectionRegistryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func validateConnectionInput(connection registry.Connection) error {
	if strings.TrimSpace(connection.Name) == "" {
		return errors.New("name is required")
	}
	if !validKindDriver(connection.Kind, connection.Driver) {
		return errors.New("kind and driver are incompatible")
	}
	if connection.Scope != "personal" && connection.Scope != "team" {
		return errors.New("scope must be personal or team")
	}
	if connection.Scope == "team" && strings.TrimSpace(connection.TeamID) == "" {
		return errors.New("teamId is required for team connections")
	}
	var endpoint struct {
		Host string `json:"host"`
		Port uint16 `json:"port"`
	}
	if err := json.Unmarshal(connection.Endpoint, &endpoint); err != nil {
		return errors.New("endpoint must include host and port")
	}
	if strings.TrimSpace(endpoint.Host) == "" || endpoint.Port == 0 {
		return errors.New("endpoint must include host and port")
	}
	return nil
}

func validKindDriver(kind, driver string) bool {
	switch kind {
	case "database":
		return driver == "mysql" || driver == "postgres" || driver == "mongodb" || driver == "redis"
	case "ssh":
		return driver == "ssh"
	default:
		return false
	}
}

func validOptionalKind(kind string) bool {
	return kind == "" || kind == "database" || kind == "ssh"
}

func validOptionalScope(scope string) bool {
	return scope == "" || scope == "personal" || scope == "team"
}

func requirePrincipal(w http.ResponseWriter, r *http.Request) (identity.Principal, bool) {
	principal, ok := identity.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "auth_required", "需要登录")
		return identity.Principal{}, false
	}
	return principal, true
}

func writeConnectionRegistryError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, registry.ErrNotFound):
		writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在")
	case errors.Is(err, registry.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "没有权限操作该连接")
	default:
		writeError(w, http.StatusBadRequest, "registry_failed", err.Error())
	}
}
