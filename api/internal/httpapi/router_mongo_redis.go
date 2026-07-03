package httpapi

import (
	"context"
	"net/http"
	"strconv"

	database "dbworkbench/api/internal/db"
	mongosvc "dbworkbench/api/internal/mongo"
	redisdb "dbworkbench/api/internal/redisdb"
)

func registerMongoRedisRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/connections/{id}/capabilities", func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := requireSession(w, r, deps.Sessions)
		if !ok {
			return
		}
		handle, ok := deps.Sessions.GetHandle(sessionID, r.PathValue("id"))
		if !ok {
			writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
			return
		}
		writeJSON(w, http.StatusOK, database.ConnectionCapabilities(handle.Driver))
	})

	mux.HandleFunc("POST /api/connections/{id}/mongo/find", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireMongo(w, r, deps)
		if !ok {
			return
		}
		var input mongosvc.FindRequest
		if decodeJSON(w, r, &input) != nil {
			return
		}
		if input.Database == "" {
			input.Database = handle.Config.Database
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.MongoDB()
		result, err := mongosvc.Find(ctx, client, input, deps.PageSize)
		if err != nil {
			writeError(w, http.StatusBadRequest, "mongo_find_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("POST /api/connections/{id}/mongo/aggregate", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireMongo(w, r, deps)
		if !ok {
			return
		}
		var input mongosvc.AggregateRequest
		if decodeJSON(w, r, &input) != nil {
			return
		}
		if input.Database == "" {
			input.Database = handle.Config.Database
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.MongoDB()
		result, err := mongosvc.Aggregate(ctx, client, input, deps.PageSize)
		if err != nil {
			writeError(w, http.StatusBadRequest, "mongo_aggregate_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("POST /api/connections/{id}/mongo/documents", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireMongo(w, r, deps)
		if !ok {
			return
		}
		var input mongosvc.DocumentMutation
		if decodeJSON(w, r, &input) != nil {
			return
		}
		if input.Database == "" {
			input.Database = handle.Config.Database
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.MongoDB()
		affected, err := mongosvc.MutateDocument(ctx, client, input)
		if err != nil {
			writeError(w, http.StatusConflict, "mongo_document_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"affected": affected})
	})

	mux.HandleFunc("GET /api/connections/{id}/mongo/collections/{collection}", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireMongo(w, r, deps)
		if !ok {
			return
		}
		databaseName := handle.Config.Database
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.MongoDB()
		detail, err := mongosvc.DescribeCollection(ctx, client, databaseName, r.PathValue("collection"))
		if err != nil {
			writeError(w, http.StatusBadGateway, "mongo_collection_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, detail)
	})

	mux.HandleFunc("POST /api/connections/{id}/mongo/collections/{collection}/indexes", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireMongo(w, r, deps)
		if !ok {
			return
		}
		var input struct {
			Keys   map[string]int `json:"keys"`
			Unique bool           `json:"unique"`
			Name   string         `json:"name"`
		}
		if decodeJSON(w, r, &input) != nil {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.MongoDB()
		name, err := mongosvc.CreateIndex(ctx, client, handle.Config.Database, r.PathValue("collection"), input.Keys, input.Unique, input.Name)
		if err != nil {
			writeError(w, http.StatusBadRequest, "mongo_index_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"name": name})
	})

	mux.HandleFunc("DELETE /api/connections/{id}/mongo/collections/{collection}/indexes/{name}", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireMongo(w, r, deps)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.MongoDB()
		if err := mongosvc.DropIndex(ctx, client, handle.Config.Database, r.PathValue("collection"), r.PathValue("name")); err != nil {
		 writeError(w, http.StatusBadRequest, "mongo_index_drop_failed", err.Error())
		 return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/connections/{id}/redis/keys", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireRedis(w, r, deps)
		if !ok {
			return
		}
		match := r.URL.Query().Get("match")
		cursor, _ := strconv.ParseUint(r.URL.Query().Get("cursor"), 10, 64)
		count, _ := strconv.Atoi(r.URL.Query().Get("count"))
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.RedisClient()
		result, err := redisdb.ScanKeys(ctx, client, match, cursor, count)
		if err != nil {
			writeError(w, http.StatusBadGateway, "redis_scan_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("GET /api/connections/{id}/redis/key", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireRedis(w, r, deps)
		if !ok {
			return
		}
		key := r.URL.Query().Get("key")
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.RedisClient()
		detail, err := redisdb.GetKey(ctx, client, key)
		if err != nil {
			writeError(w, http.StatusNotFound, "redis_key_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, detail)
	})

	mux.HandleFunc("PUT /api/connections/{id}/redis/key", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireRedis(w, r, deps)
		if !ok {
		 return
		}
		var input struct {
			Key   string           `json:"key"`
			Value redisdb.KeyUpdate `json:"value"`
		}
		if decodeJSON(w, r, &input) != nil {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.RedisClient()
		if err := redisdb.SaveKey(ctx, client, input.Key, input.Value); err != nil {
			writeError(w, http.StatusBadRequest, "redis_save_failed", err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("DELETE /api/connections/{id}/redis/key", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireRedis(w, r, deps)
		if !ok {
			return
		}
		key := r.URL.Query().Get("key")
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.RedisClient()
		if err := redisdb.DeleteKey(ctx, client, key); err != nil {
			writeError(w, http.StatusConflict, "redis_delete_failed", err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/connections/{id}/redis/key/ttl", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireRedis(w, r, deps)
		if !ok {
			return
		}
		var input struct {
			Key string `json:"key"`
			TTL int64  `json:"ttl"`
		}
		if decodeJSON(w, r, &input) != nil {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.RedisClient()
		if err := redisdb.SetTTL(ctx, client, input.Key, input.TTL); err != nil {
			writeError(w, http.StatusBadRequest, "redis_ttl_failed", err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/connections/{id}/redis/commands", func(w http.ResponseWriter, r *http.Request) {
		handle, ok := requireRedis(w, r, deps)
		if !ok {
			return
		}
		var input redisdb.CommandRequest
		if decodeJSON(w, r, &input) != nil {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), deps.QueryTimeout)
		defer cancel()
		client, _ := handle.RedisClient()
		result, err := redisdb.ExecuteCommands(ctx, client, input.Commands)
		if err != nil {
			writeError(w, http.StatusBadRequest, "redis_command_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	})
}

func requireMongo(w http.ResponseWriter, r *http.Request, deps Dependencies) (*database.Handle, bool) {
	sessionID, ok := requireSession(w, r, deps.Sessions)
	if !ok {
		return nil, false
	}
	handle, ok := deps.Sessions.GetHandle(sessionID, r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
		return nil, false
	}
	if handle.Driver != database.MongoDB {
		writeError(w, http.StatusBadRequest, "invalid_driver", "当前连接不是 MongoDB")
		return nil, false
	}
	return handle, true
}

func requireRedis(w http.ResponseWriter, r *http.Request, deps Dependencies) (*database.Handle, bool) {
	sessionID, ok := requireSession(w, r, deps.Sessions)
	if !ok {
		return nil, false
	}
	handle, ok := deps.Sessions.GetHandle(sessionID, r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "connection_not_found", "连接不存在或已过期")
		return nil, false
	}
	if handle.Driver != database.Redis {
		writeError(w, http.StatusBadRequest, "invalid_driver", "当前连接不是 Redis")
		return nil, false
	}
	return handle, true
}
