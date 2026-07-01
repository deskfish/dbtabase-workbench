package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"dbworkbench/api/internal/registry"
)

func registerRegistryRoutes(mux *http.ServeMux, store *registry.Store) {
	mux.HandleFunc("GET /api/registry/personal/connections", func(w http.ResponseWriter, r *http.Request) {
		nickname, ok := requireNickname(w, r)
		if !ok {
			return
		}
		items, err := store.ListPersonal(r.Context(), nickname)
		if err != nil {
			writeRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": items})
	})

	mux.HandleFunc("POST /api/registry/personal/connections", func(w http.ResponseWriter, r *http.Request) {
		nickname, ok := requireNickname(w, r)
		if !ok {
			return
		}
		var record registry.ConnectionRecord
		if err := decodeJSON(w, r, &record); err != nil {
			return
		}
		saved, err := store.UpsertPersonal(r.Context(), nickname, record)
		if err != nil {
			writeRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connection": saved})
	})

	mux.HandleFunc("DELETE /api/registry/personal/connections/{id}", func(w http.ResponseWriter, r *http.Request) {
		nickname, ok := requireNickname(w, r)
		if !ok {
			return
		}
		if err := store.DeletePersonal(r.Context(), nickname, r.PathValue("id")); err != nil {
			writeRegistryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/registry/personal/migrate", func(w http.ResponseWriter, r *http.Request) {
		nickname, ok := requireNickname(w, r)
		if !ok {
			return
		}
		var input struct {
			Connections []registry.ConnectionRecord `json:"connections"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		items, err := store.MigratePersonal(r.Context(), nickname, input.Connections)
		if err != nil {
			writeRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": items})
	})

	mux.HandleFunc("GET /api/registry/team/connections", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireNickname(w, r); !ok {
			return
		}
		items, err := store.ListTeam(r.Context())
		if err != nil {
			writeRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": items})
	})

	mux.HandleFunc("POST /api/registry/team/connections", func(w http.ResponseWriter, r *http.Request) {
		nickname, ok := requireNickname(w, r)
		if !ok {
			return
		}
		var input struct {
			PersonalConnectionID string `json:"personalConnectionId"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if strings.TrimSpace(input.PersonalConnectionID) == "" {
			writeError(w, http.StatusBadRequest, "connection_required", "请选择要共享的个人连接")
			return
		}
		item, err := store.SharePersonalToTeam(r.Context(), nickname, input.PersonalConnectionID)
		if err != nil {
			writeRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"connection": item})
	})

	mux.HandleFunc("POST /api/registry/team/connections/{id}/import", func(w http.ResponseWriter, r *http.Request) {
		nickname, ok := requireNickname(w, r)
		if !ok {
			return
		}
		item, err := store.ImportTeamToPersonal(r.Context(), nickname, r.PathValue("id"))
		if err != nil {
			writeRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"connection": item})
	})
}

func requireNickname(w http.ResponseWriter, r *http.Request) (string, bool) {
	raw := strings.TrimSpace(r.Header.Get("X-User-Nickname"))
	if raw == "" {
		writeError(w, http.StatusBadRequest, "nickname_required", "请先设置昵称后再同步连接配置")
		return "", false
	}
	nickname, err := url.QueryUnescape(raw)
	if err != nil || nickname == "" {
		nickname = raw
	}
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		writeError(w, http.StatusBadRequest, "nickname_required", "请先设置昵称后再同步连接配置")
		return "", false
	}
	if len([]rune(nickname)) > 32 {
		writeError(w, http.StatusBadRequest, "nickname_invalid", "昵称长度不能超过 32 个字符")
		return "", false
	}
	return nickname, true
}

func writeRegistryError(w http.ResponseWriter, err error) {
	if errors.Is(err, registry.ErrNotFound) {
		writeError(w, http.StatusNotFound, "connection_not_found", "连接配置不存在")
		return
	}
	writeError(w, http.StatusBadRequest, "registry_failed", err.Error())
}
