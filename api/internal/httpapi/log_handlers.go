package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"

	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/logs"
	"dbworkbench/api/internal/registry"
	"dbworkbench/api/internal/sshlog"
)

type LogStore interface {
	ListSessions(context.Context, identity.Principal) ([]logs.Session, error)
	CreateSession(context.Context, identity.Principal, logs.CreateSessionInput) (logs.Session, error)
	AddFile(context.Context, identity.Principal, string, logs.AddFileInput) (logs.SourceFile, error)
	CreateTailFile(context.Context, identity.Principal, string, logs.CreateTailFileInput) (logs.SourceFile, error)
	AppendTailLine(context.Context, identity.Principal, string, string, string) (logs.Entry, error)
	Search(context.Context, identity.Principal, string, logs.SearchInput) (logs.SearchResult, error)
	Files(context.Context, identity.Principal, string) ([]logs.SourceFile, error)
	Tree(context.Context, identity.Principal, string) ([]logs.ServiceScope, error)
	Timeline(context.Context, identity.Principal, string, int64) ([]logs.TimeBucket, error)
	DeleteSession(context.Context, identity.Principal, string) error
}

type LogConnectionStore interface {
	List(context.Context, identity.Principal, string, string) ([]registry.Connection, error)
	SecretForUse(context.Context, identity.Principal, string) (registry.Connection, registry.Secret, error)
}

type LogSSHService interface {
	Test(context.Context, sshlog.Credentials) error
	Browse(context.Context, sshlog.Credentials, string) ([]sshlog.RemoteEntry, error)
	Scan(context.Context, sshlog.Credentials, string, int, int) (sshlog.ScanResult, error)
	OpenFile(context.Context, sshlog.Credentials, string) (io.ReadCloser, error)
	Tail(context.Context, sshlog.Credentials, string, int, func(), func(string) error) error
}

var errLogSSHUnavailable = errors.New("ssh log service unavailable")
var errLogDestinationInvalid = errors.New("ssh destination invalid")

func registerLogRoutes(mux *http.ServeMux, deps Dependencies) {
	store := deps.Logs
	mux.HandleFunc("GET /api/logs/sessions", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		sessions, err := store.ListSessions(r.Context(), principal)
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
	})

	mux.HandleFunc("POST /api/logs/sessions", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		var input struct {
			Name   string `json:"name"`
			Scope  string `json:"scope"`
			TeamID string `json:"teamId"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		session, err := store.CreateSession(r.Context(), principal, logs.CreateSessionInput{Name: input.Name, Scope: input.Scope, TeamID: input.TeamID})
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"session": session})
	})

	mux.HandleFunc("DELETE /api/logs/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if err := store.DeleteSession(r.Context(), principal, r.PathValue("id")); err != nil {
			writeLogError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/logs/sessions/{id}/upload", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 512<<20)
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_upload", "日志上传内容无效")
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "file_required", "请选择日志文件")
			return
		}
		defer file.Close()
		sourceFile, err := store.AddFile(r.Context(), principal, r.PathValue("id"), logs.AddFileInput{
			OriginalName: header.Filename,
			ServiceName:  strings.TrimSpace(r.FormValue("serviceName")),
			NodeName:     strings.TrimSpace(r.FormValue("nodeName")),
			Reader:       file,
		})
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"file": sourceFile})
	})

	mux.HandleFunc("GET /api/logs/ssh-connections", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if deps.LogConnections == nil {
			writeSSHLogError(w, errLogSSHUnavailable)
			return
		}
		connections, err := deps.LogConnections.List(r.Context(), principal, "ssh", "")
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": connections})
	})

	mux.HandleFunc("POST /api/logs/ssh/test", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if deps.LogConnections == nil || deps.LogSSH == nil {
			writeSSHLogError(w, errLogSSHUnavailable)
			return
		}
		var input struct {
			ConnectionID string `json:"connectionId"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		credentials, err := resolveSSHLogCredentials(r.Context(), principal, deps, input.ConnectionID)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		if err := deps.LogSSH.Test(r.Context(), credentials); err != nil {
			writeSSHLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	mux.HandleFunc("POST /api/logs/ssh/browse", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if deps.LogConnections == nil || deps.LogSSH == nil {
			writeSSHLogError(w, errLogSSHUnavailable)
			return
		}
		var input struct {
			ConnectionID string `json:"connectionId"`
			Path         string `json:"path"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		remotePath := input.Path
		if strings.TrimSpace(remotePath) == "" {
			remotePath = "/"
		}
		credentials, err := resolveSSHLogCredentials(r.Context(), principal, deps, input.ConnectionID)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		entries, err := deps.LogSSH.Browse(r.Context(), credentials, remotePath)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"path": remotePath, "entries": entries})
	})

	mux.HandleFunc("POST /api/logs/ssh/scan", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if deps.LogConnections == nil || deps.LogSSH == nil {
			writeSSHLogError(w, errLogSSHUnavailable)
			return
		}
		var input struct {
			ConnectionID string `json:"connectionId"`
			Path         string `json:"path"`
			MaxDepth     int    `json:"maxDepth"`
			MaxFiles     int    `json:"maxFiles"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		remotePath := input.Path
		if strings.TrimSpace(remotePath) == "" {
			remotePath = "/"
		}
		credentials, err := resolveSSHLogCredentials(r.Context(), principal, deps, input.ConnectionID)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		result, err := deps.LogSSH.Scan(r.Context(), credentials, remotePath, input.MaxDepth, input.MaxFiles)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("POST /api/logs/sessions/{id}/ssh/import", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if deps.LogConnections == nil || deps.LogSSH == nil {
			writeSSHLogError(w, errLogSSHUnavailable)
			return
		}
		var input struct {
			ConnectionID string `json:"connectionId"`
			Path         string `json:"path"`
			ServiceName  string `json:"serviceName"`
			NodeName     string `json:"nodeName"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		remotePath, err := sshlog.ValidateRemotePath(input.Path)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		credentials, err := resolveSSHLogCredentials(r.Context(), principal, deps, input.ConnectionID)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		reader, err := deps.LogSSH.OpenFile(r.Context(), credentials, remotePath)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		defer reader.Close()
		sourceFile, err := store.AddFile(r.Context(), principal, r.PathValue("id"), logs.AddFileInput{
			OriginalName: path.Base(remotePath),
			ServiceName:  input.ServiceName,
			NodeName:     input.NodeName,
			SourceType:   "ssh_import",
			Reader:       reader,
		})
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"file": sourceFile})
	})

	mux.HandleFunc("POST /api/logs/sessions/{id}/tail", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		if deps.LogConnections == nil || deps.LogSSH == nil {
			writeSSHLogError(w, errLogSSHUnavailable)
			return
		}
		var input struct {
			ConnectionID string `json:"connectionId"`
			Path         string `json:"path"`
			Lines        int    `json:"lines"`
			ServiceName  string `json:"serviceName"`
			NodeName     string `json:"nodeName"`
		}
		if err := decodeJSON(w, r, &input); err != nil {
			return
		}
		remotePath, err := sshlog.ValidateRemotePath(input.Path)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		credentials, err := resolveSSHLogCredentials(r.Context(), principal, deps, input.ConnectionID)
		if err != nil {
			writeSSHLogError(w, err)
			return
		}
		sourceFile, err := store.CreateTailFile(r.Context(), principal, r.PathValue("id"), logs.CreateTailFileInput{
			RemotePath:  remotePath,
			ServiceName: input.ServiceName,
			NodeName:    input.NodeName,
		})
		if err != nil {
			writeLogError(w, err)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			writeError(w, http.StatusInternalServerError, "streaming_unavailable", "当前服务不支持日志流")
			return
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("Connection", "keep-alive")
		sendEvent := func(payload any) error {
			encoded, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", encoded); err != nil {
				return err
			}
			flusher.Flush()
			return nil
		}
		var streamErr error
		tailErr := deps.LogSSH.Tail(r.Context(), credentials, remotePath, clampTailLines(input.Lines), func() {
			if streamErr != nil {
				return
			}
			streamErr = sendEvent(map[string]any{"type": "ready", "path": remotePath, "sourceFile": sourceFile})
		}, func(line string) error {
			if streamErr != nil {
				return streamErr
			}
			entry, err := store.AppendTailLine(r.Context(), principal, r.PathValue("id"), sourceFile.ID, line)
			if err != nil {
				return err
			}
			return sendEvent(map[string]any{"type": "line", "line": line, "entry": entry})
		})
		if streamErr != nil {
			return
		}
		if tailErr != nil {
			if errors.Is(tailErr, context.Canceled) || errors.Is(r.Context().Err(), context.Canceled) {
				_ = sendEvent(map[string]any{"type": "stopped"})
				return
			}
			_ = sendEvent(map[string]any{"type": "error", "message": sshLogMessage(tailErr)})
			return
		}
		_ = sendEvent(map[string]any{"type": "done"})
	})

	mux.HandleFunc("GET /api/logs/sessions/{id}/search", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		result, err := store.Search(r.Context(), principal, r.PathValue("id"), parseLogSearch(r))
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	mux.HandleFunc("GET /api/logs/sessions/{id}/files", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		files, err := store.Files(r.Context(), principal, r.PathValue("id"))
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"files": files})
	})

	mux.HandleFunc("GET /api/logs/sessions/{id}/tree", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		tree, err := store.Tree(r.Context(), principal, r.PathValue("id"))
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tree": tree})
	})

	mux.HandleFunc("GET /api/logs/sessions/{id}/timeline", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := requirePrincipal(w, r)
		if !ok {
			return
		}
		bucketSizeMs := int64(60_000)
		if raw := strings.TrimSpace(r.URL.Query().Get("bucketSizeMs")); raw != "" {
			if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed > 0 {
				bucketSizeMs = parsed
			}
		}
		buckets, err := store.Timeline(r.Context(), principal, r.PathValue("id"), bucketSizeMs)
		if err != nil {
			writeLogError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"bucketSizeMs": bucketSizeMs, "buckets": buckets})
	})
}

func resolveSSHLogCredentials(ctx context.Context, principal identity.Principal, deps Dependencies, connectionID string) (sshlog.Credentials, error) {
	if deps.LogConnections == nil {
		return sshlog.Credentials{}, errLogSSHUnavailable
	}
	if strings.TrimSpace(connectionID) == "" {
		return sshlog.Credentials{}, logs.ErrInvalid
	}
	connection, secret, err := deps.LogConnections.SecretForUse(ctx, principal, connectionID)
	if err != nil {
		return sshlog.Credentials{}, err
	}
	if connection.Kind != "ssh" || connection.Driver != "ssh" {
		return sshlog.Credentials{}, logs.ErrInvalid
	}
	var endpoint struct {
		Host string `json:"host"`
		Port uint16 `json:"port"`
	}
	if err := json.Unmarshal(connection.Endpoint, &endpoint); err != nil {
		return sshlog.Credentials{}, logs.ErrInvalid
	}
	if strings.TrimSpace(endpoint.Host) == "" || endpoint.Port == 0 {
		return sshlog.Credentials{}, logs.ErrInvalid
	}
	if deps.ValidateDestination != nil {
		if err := deps.ValidateDestination(ctx, endpoint.Host, endpoint.Port); err != nil {
			return sshlog.Credentials{}, fmt.Errorf("%w: %v", errLogDestinationInvalid, err)
		}
	}
	return sshlog.Credentials{
		Host:       endpoint.Host,
		Port:       endpoint.Port,
		Username:   secret.Username,
		Password:   secret.Password,
		PrivateKey: secret.PrivateKey,
		Passphrase: secret.Passphrase,
	}, nil
}

func clampTailLines(value int) int {
	if value < 0 {
		return 0
	}
	if value > 5000 {
		return 5000
	}
	if value == 0 {
		return 200
	}
	return value
}

func parseLogSearch(r *http.Request) logs.SearchInput {
	query := r.URL.Query()
	input := logs.SearchInput{
		Query:    query.Get("query"),
		Levels:   query["level"],
		Services: query["service"],
		NodeKeys: query["nodeKey"],
		Limit:    parseIntDefault(query.Get("limit"), 200),
	}
	if value, ok := parseOptionalInt64(query.Get("timeFromMs")); ok {
		input.TimeFromMs = &value
	}
	if value, ok := parseOptionalInt64(query.Get("timeToMs")); ok {
		input.TimeToMs = &value
	}
	return input
}

func parseOptionalInt64(raw string) (int64, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, false
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	return value, err == nil
}

func parseIntDefault(raw string, fallback int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func writeLogError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, logs.ErrNotFound):
		writeError(w, http.StatusNotFound, "log_not_found", "日志会话不存在")
	case errors.Is(err, logs.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "没有权限操作该日志会话")
	case errors.Is(err, logs.ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid_log_request", "日志请求参数无效")
	default:
		writeError(w, http.StatusBadRequest, "logs_failed", err.Error())
	}
}

func writeSSHLogError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errLogSSHUnavailable):
		writeError(w, http.StatusServiceUnavailable, "ssh_logs_unavailable", "SSH 日志服务不可用")
	case errors.Is(err, registry.ErrNotFound):
		writeError(w, http.StatusNotFound, "connection_not_found", "SSH 连接不存在")
	case errors.Is(err, registry.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "没有权限使用该 SSH 连接")
	case errors.Is(err, logs.ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid_ssh_log_request", "SSH 日志请求参数无效")
	case errors.Is(err, errLogDestinationInvalid):
		writeError(w, http.StatusBadRequest, "destination_invalid", "SSH 地址无效或不在允许范围内")
	default:
		writeError(w, http.StatusBadRequest, "ssh_logs_failed", sshLogMessage(err))
	}
}

func sshLogMessage(err error) string {
	if err == nil {
		return "SSH 操作失败"
	}
	message := err.Error()
	if strings.Contains(strings.ToLower(message), "auth") || strings.Contains(strings.ToLower(message), "unable to authenticate") {
		return "SSH 认证失败，请检查用户名、密码或私钥"
	}
	if strings.Contains(strings.ToLower(message), "timeout") || strings.Contains(strings.ToLower(message), "deadline") {
		return "SSH 连接超时，请检查地址和端口"
	}
	message = strings.ReplaceAll(message, "\n", " ")
	if len(message) > 240 {
		message = message[:240] + "…"
	}
	return message
}
