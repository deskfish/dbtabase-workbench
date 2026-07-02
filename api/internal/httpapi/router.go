package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/query"
	"dbworkbench/api/internal/registry"
	"dbworkbench/api/internal/schema"
	"dbworkbench/api/internal/session"
	"dbworkbench/api/internal/table"
)

type Dependencies struct {
	Ready               func() bool
	Sessions            *session.Store
	Registry            *registry.Store
	ValidateDestination func(context.Context, string, uint16) error
	OpenConnection      func(context.Context, database.ConnectionInput) (*sql.DB, error)
	Queries             *query.Service
	Transactions        *query.TransactionService
	Schema              *schema.Service
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
			if input.Driver == database.PostgreSQL && input.Database == "" {
				input.Database = "postgres"
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			dbHandle, err := deps.OpenConnection(ctx, input)
			if err != nil {
				writeError(w, http.StatusBadGateway, "connection_failed", "无法连接数据库")
				return
			}
			connectionID := deps.Sessions.PutConnection(sessionID, dbHandle, string(input.Driver), input)
			writeJSON(w, http.StatusCreated, map[string]string{"connectionId": connectionID, "database": input.Database})
		})
		mux.HandleFunc("GET /api/connections/{id}/databases", func(w http.ResponseWriter, r *http.Request) {
			sessionID, ok := requireSession(w, r, deps.Sessions)
			if !ok {
				return
			}
			dbHandle, driver, found := deps.Sessions.GetConnection(sessionID, r.PathValue("id"))
			if !found {
				writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
				return
			}
			_, currentDatabase, _ := deps.Sessions.GetConnectionConfig(sessionID, r.PathValue("id"))
			names, err := database.ListDatabases(r.Context(), dbHandle, database.Driver(driver))
			if err != nil {
				writeError(w, http.StatusBadGateway, "databases_failed", "无法读取数据库列表")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"databases": names, "current": currentDatabase})
		})
		mux.HandleFunc("POST /api/connections/{id}/database", func(w http.ResponseWriter, r *http.Request) {
			sessionID, ok := requireSession(w, r, deps.Sessions)
			if !ok {
				return
			}
			connectionID := r.PathValue("id")
			config, currentDatabase, found := deps.Sessions.GetConnectionConfig(sessionID, connectionID)
			if !found {
				writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
				return
			}
			var input struct {
				Database string `json:"database"`
			}
			if err := decodeJSON(w, r, &input); err != nil {
				return
			}
			if input.Database == "" {
				writeError(w, http.StatusBadRequest, "database_required", "请选择目标数据库")
				return
			}
			if input.Database == currentDatabase {
				writeJSON(w, http.StatusOK, map[string]string{"database": currentDatabase})
				return
			}
			if deps.OpenConnection == nil {
				writeError(w, http.StatusServiceUnavailable, "connections_unavailable", "数据库连接服务不可用")
				return
			}
			config.Database = input.Database
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			dbHandle, err := deps.OpenConnection(ctx, config)
			if err != nil {
				writeError(w, http.StatusBadGateway, "connection_failed", "无法切换到目标数据库")
				return
			}
			if !deps.Sessions.ReplaceDatabase(sessionID, connectionID, dbHandle, input.Database) {
				_ = dbHandle.Close()
				writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"database": input.Database})
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
		if deps.Transactions != nil {
			registerTransactionRoutes(mux, deps)
		}
		if deps.Schema != nil {
			registerSchemaRoutes(mux, deps)
		}
	}
	if deps.Registry != nil {
		registerRegistryRoutes(mux, deps.Registry)
	}
	return securityHeaders(mux)
}

func registerSchemaRoutes(mux *http.ServeMux, deps Dependencies) {
	get := func(w http.ResponseWriter, r *http.Request) (string, *sql.DB, database.Driver, database.TableDetail, bool) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return "", nil, "", database.TableDetail{}, false
		}
		dbHandle, driverName, found := deps.Sessions.GetConnection(sessionID, r.PathValue("id"))
		if !found {
			writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
			return "", nil, "", database.TableDetail{}, false
		}
		driver := database.Driver(driverName)
		detail, err := database.DescribeTable(r.Context(), dbHandle, driver, r.PathValue("schema"), r.PathValue("table"))
		if err != nil {
			writeError(w, http.StatusBadGateway, "table_metadata_failed", "无法读取表结构")
			return "", nil, "", database.TableDetail{}, false
		}
		return sessionID, dbHandle, driver, detail, true
	}
	mux.HandleFunc("GET /api/connections/{id}/tables/{schema}/{table}", func(w http.ResponseWriter, r *http.Request) {
		_, _, _, detail, ok := get(w, r)
		if ok {
			writeJSON(w, http.StatusOK, detail)
		}
	})
	mux.HandleFunc("POST /api/connections/{id}/tables/{schema}/{table}/schema/preview", func(w http.ResponseWriter, r *http.Request) {
		sessionID, _, driver, detail, ok := get(w, r)
		if !ok {
			return
		}
		var input struct {
			Operations []schema.Operation `json:"operations"`
		}
		if decodeJSON(w, r, &input) != nil {
			return
		}
		scope := queryScope(sessionID, r.PathValue("id")) + "/" + r.PathValue("schema") + "/" + r.PathValue("table")
		p, err := deps.Schema.Preview(string(driver), scope, detail.Table, input.Operations)
		if err != nil {
			writeError(w, http.StatusBadRequest, "schema_preview_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, p)
	})
	mux.HandleFunc("POST /api/connections/{id}/tables/{schema}/{table}/schema/execute", func(w http.ResponseWriter, r *http.Request) {
		sessionID, dbHandle, _, detail, ok := get(w, r)
		if !ok {
			return
		}
		var input struct {
			Token     string `json:"token"`
			Confirmed bool   `json:"confirmed"`
		}
		if decodeJSON(w, r, &input) != nil {
			return
		}
		scope := queryScope(sessionID, r.PathValue("id")) + "/" + r.PathValue("schema") + "/" + r.PathValue("table")
		results, err := deps.Schema.Execute(r.Context(), dbHandle, scope, schema.Fingerprint(detail.Table), input.Token, input.Confirmed)
		if errors.Is(err, schema.ErrStructureDrift) {
			writeError(w, http.StatusConflict, "schema_drift", "表结构已变化，请刷新后重新预览")
			return
		}
		if errors.Is(err, schema.ErrConfirmation) {
			writeError(w, http.StatusConflict, "schema_confirmation_required", "危险结构变更需要确认")
			return
		}
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": map[string]string{"code": "schema_execute_failed", "message": "结构变更执行失败"}, "results": results})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"results": results})
	})
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
			TransactionID      string `json:"transactionId"`
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
		var executor query.Executor = dbHandle
		if input.TransactionID != "" {
			if deps.Transactions == nil {
				writeError(w, http.StatusBadRequest, "transactions_unavailable", "事务服务不可用")
				return
			}
			tx, found := deps.Transactions.Get(queryScope(sessionID, connectionID), input.TransactionID)
			if !found {
				writeError(w, http.StatusNotFound, "transaction_not_found", "事务不存在或已过期")
				return
			}
			executor = tx
		}
		queryID := deps.Queries.Start(queryScope(sessionID, connectionID), executor, input.SQL)
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

func registerTransactionRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /api/connections/{id}/transactions", func(w http.ResponseWriter, r *http.Request) {
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
		id, err := deps.Transactions.Begin(queryScope(sessionID, connectionID), dbHandle)
		if err != nil {
			writeError(w, http.StatusBadGateway, "transaction_failed", "无法开始事务")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"transactionId": id})
	})
	mux.HandleFunc("POST /api/connections/{id}/transactions/{txId}/commit", func(w http.ResponseWriter, r *http.Request) {
		finishTransaction(w, r, deps, true)
	})
	mux.HandleFunc("POST /api/connections/{id}/transactions/{txId}/rollback", func(w http.ResponseWriter, r *http.Request) {
		finishTransaction(w, r, deps, false)
	})
	mux.HandleFunc("POST /api/connections/{id}/rows/{operation}", func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return
		}
		connectionID := r.PathValue("id")
		dbHandle, driverName, found := deps.Sessions.GetConnection(sessionID, connectionID)
		if !found {
			writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
			return
		}
		var input struct {
			table.Mutation
			TransactionID string `json:"transactionId"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		driver := database.Driver(driverName)
		var statement table.Statement
		var err error
		switch r.PathValue("operation") {
		case "insert":
			statement, err = table.BuildInsert(driver, input.Mutation)
		case "update":
			statement, err = table.BuildUpdate(driver, input.Mutation)
		case "delete":
			statement, err = table.BuildDelete(driver, input.Mutation)
		default:
			writeError(w, http.StatusNotFound, "operation_not_found", "不支持的数据操作")
			return
		}
		if errors.Is(err, table.ErrUniqueKeyRequired) {
			writeError(w, http.StatusUnprocessableEntity, "unique_key_required", "修改或删除需要主键或唯一键")
			return
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_mutation", "数据修改请求无效")
			return
		}
		if input.TransactionID != "" {
			tx, ok := deps.Transactions.Get(queryScope(sessionID, connectionID), input.TransactionID)
			if !ok {
				writeError(w, http.StatusNotFound, "transaction_not_found", "事务不存在或已过期")
				return
			}
			if err := table.ExecuteOne(r.Context(), tx, statement); err != nil {
				writeError(w, http.StatusConflict, "mutation_failed", "数据修改未影响恰好一行")
				return
			}
		} else {
			tx, err := dbHandle.BeginTx(r.Context(), nil)
			if err != nil {
				writeError(w, http.StatusBadGateway, "transaction_failed", "无法开始数据修改")
				return
			}
			if err := table.ExecuteOne(r.Context(), tx, statement); err != nil {
				_ = tx.Rollback()
				writeError(w, http.StatusConflict, "mutation_failed", "数据修改未影响恰好一行")
				return
			}
			if err := tx.Commit(); err != nil {
				writeError(w, http.StatusBadGateway, "commit_failed", "数据修改提交失败")
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]int{"affectedRows": 1})
	})
}

func finishTransaction(w http.ResponseWriter, r *http.Request, deps Dependencies, commit bool) {
	sessionID, ok := requireSession(w, r, deps.Sessions)
	if !ok {
		return
	}
	scope := queryScope(sessionID, r.PathValue("id"))
	var err error
	if commit {
		err = deps.Transactions.Commit(scope, r.PathValue("txId"))
	} else {
		err = deps.Transactions.Rollback(scope, r.PathValue("txId"))
	}
	if err != nil {
		writeError(w, http.StatusNotFound, "transaction_not_found", "事务不存在或已过期")
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "请求内容超过大小限制")
			return err
		}
		writeError(w, http.StatusBadRequest, "invalid_json", "请求内容格式不正确")
		return err
	}
	return nil
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("X-Request-ID", requestID())
		next.ServeHTTP(w, r)
	})
}

func requestID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		panic("cryptographic random source unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
