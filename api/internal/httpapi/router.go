package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/session"
)

type Dependencies struct {
	Ready               func() bool
	Sessions            *session.Store
	ValidateDestination func(context.Context, string, uint16) error
	OpenConnection      func(context.Context, database.ConnectionInput) (*sql.DB, error)
}

func NewRouter(deps Dependencies) http.Handler {
	if deps.Ready == nil {
		deps.Ready = func() bool { return true }
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, _ *http.Request) {
		if !deps.Ready() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	if deps.Sessions != nil {
		mux.HandleFunc("POST /api/sessions", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusCreated, map[string]string{"sessionId": deps.Sessions.CreateSession()})
		})
		mux.HandleFunc("POST /api/connections", func(w http.ResponseWriter, r *http.Request) {
			sessionID, ok := requireSession(w, r, deps.Sessions)
			if !ok {
				return
			}
			var input database.ConnectionInput
			if err := decodeJSON(w, r, &input); err != nil {
				return
			}
			if deps.ValidateDestination != nil {
				if err := deps.ValidateDestination(r.Context(), input.Host, input.Port); err != nil {
					writeError(w, http.StatusForbidden, "destination_denied", "数据库地址不在允许范围内")
					return
				}
			}
			if deps.OpenConnection == nil {
				writeError(w, http.StatusServiceUnavailable, "connections_unavailable", "数据库连接服务不可用")
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			dbHandle, err := deps.OpenConnection(ctx, input)
			if err != nil {
				writeError(w, http.StatusBadGateway, "connection_failed", "无法连接数据库")
				return
			}
			connectionID := deps.Sessions.PutConnection(sessionID, dbHandle, string(input.Driver))
			writeJSON(w, http.StatusCreated, map[string]string{"connectionId": connectionID})
		})
		mux.HandleFunc("DELETE /api/connections/{id}", func(w http.ResponseWriter, r *http.Request) {
			sessionID, ok := requireSession(w, r, deps.Sessions)
			if !ok {
				return
			}
			deps.Sessions.Delete(sessionID, r.PathValue("id"))
			w.WriteHeader(http.StatusNoContent)
		})
		mux.HandleFunc("GET /api/connections/{id}/metadata", func(w http.ResponseWriter, r *http.Request) {
			sessionID, ok := requireSession(w, r, deps.Sessions)
			if !ok {
				return
			}
			dbHandle, driver, found := deps.Sessions.GetConnection(sessionID, r.PathValue("id"))
			if !found {
				writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
				return
			}
			objects, err := database.Metadata(r.Context(), dbHandle, database.Driver(driver))
			if err != nil {
				writeError(w, http.StatusBadGateway, "metadata_failed", "无法读取数据库结构")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"objects": objects})
		})
	}
	return mux
}

func requireSession(w http.ResponseWriter, r *http.Request, store *session.Store) (string, bool) {
	sessionID := r.Header.Get("X-Session-ID")
	if sessionID == "" || !store.HasSession(sessionID) {
		writeError(w, http.StatusUnauthorized, "invalid_session", "会话不存在或已过期")
		return "", false
	}
	return sessionID, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "请求内容格式不正确")
		return err
	}
	return nil
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
