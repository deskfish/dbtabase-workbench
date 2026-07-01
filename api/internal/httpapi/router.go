package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/query"
	"dbworkbench/api/internal/session"
)

type Dependencies struct {
	Ready               func() bool
	Sessions            *session.Store
	ValidateDestination func(context.Context, string, uint16) error
	OpenConnection      func(context.Context, database.ConnectionInput) (*sql.DB, error)
	Queries             *query.Service
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
		if deps.Queries != nil {
			registerQueryRoutes(mux, deps)
		}
	}
	return mux
}

func registerQueryRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /api/connections/{id}/queries", func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return
		}
		connectionID := r.PathValue("id")
		dbHandle, _, found := deps.Sessions.GetConnection(sessionID, connectionID)
		if !found {
			writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
			return
		}
		var input struct {
			SQL                string `json:"sql"`
			Confirmed          bool   `json:"confirmed"`
			ConfirmationTarget string `json:"confirmationTarget"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		if input.SQL == "" {
			writeError(w, http.StatusBadRequest, "sql_required", "SQL 不能为空")
			return
		}
		risk := query.Classify(input.SQL)
		if risk.Level == query.Confirm && !input.Confirmed {
			writeJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{"code": "confirmation_required", "message": risk.Reason, "risk": risk}})
			return
		}
		if risk.Level == query.TypeTarget && (!input.Confirmed || input.ConfirmationTarget != risk.Target) {
			writeJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{"code": "target_confirmation_required", "message": risk.Reason, "risk": risk}})
			return
		}
		queryID := deps.Queries.Start(queryScope(sessionID, connectionID), dbHandle, input.SQL)
		writeJSON(w, http.StatusAccepted, map[string]string{"queryId": queryID})
	})
	mux.HandleFunc("GET /api/connections/{id}/queries/{queryId}", func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return
		}
		cursor, err := strconv.Atoi(defaultString(r.URL.Query().Get("cursor"), "0"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_cursor", "结果游标格式不正确")
			return
		}
		result, err := deps.Queries.Result(queryScope(sessionID, r.PathValue("id")), r.PathValue("queryId"), cursor)
		if errors.Is(err, query.ErrQueryPending) {
			writeJSON(w, http.StatusAccepted, map[string]string{"status": "running"})
			return
		}
		if errors.Is(err, query.ErrQueryNotFound) {
			writeError(w, http.StatusNotFound, "query_not_found", "查询不存在")
			return
		}
		if err != nil {
			writeError(w, http.StatusBadGateway, "query_failed", "查询执行失败")
			return
		}
		writeJSON(w, http.StatusOK, result)
	})
	mux.HandleFunc("DELETE /api/connections/{id}/queries/{queryId}", func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return
		}
		if err := deps.Queries.Cancel(queryScope(sessionID, r.PathValue("id")), r.PathValue("queryId")); err != nil {
			writeError(w, http.StatusNotFound, "query_not_found", "查询不存在")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/connections/{id}/queries/{queryId}/export.csv", func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="query-result.csv"`)
		if err := deps.Queries.ExportCSV(queryScope(sessionID, r.PathValue("id")), r.PathValue("queryId"), w); err != nil {
			if errors.Is(err, query.ErrQueryPending) {
				return
			}
			http.Error(w, "export failed", http.StatusBadGateway)
		}
	})
}

func queryScope(sessionID, connectionID string) string { return sessionID + "/" + connectionID }

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
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
