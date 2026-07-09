package httpapi

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/logs"
	"dbworkbench/api/internal/registry"
	connectionSession "dbworkbench/api/internal/session"
	"dbworkbench/api/internal/sshlog"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

type fakeLogStore struct {
	created   logs.CreateSessionInput
	uploaded  logs.AddFileInput
	tailInput logs.CreateTailFileInput
	appended  []string
	err       error
}

func (f *fakeLogStore) ListSessions(context.Context, identity.Principal) ([]logs.Session, error) {
	return []logs.Session{{ID: "logs_one", Name: "One", Status: "ready", Scope: "personal", CreatedAt: time.Unix(0, 0), UpdatedAt: time.Unix(0, 0), FileCount: 1, ServiceCount: 1}}, f.err
}

func (f *fakeLogStore) CreateSession(_ context.Context, _ identity.Principal, input logs.CreateSessionInput) (logs.Session, error) {
	f.created = input
	return logs.Session{ID: "logs_created", Name: input.Name, Status: "pending", Scope: input.Scope, TeamID: input.TeamID, CreatedAt: time.Unix(0, 0), UpdatedAt: time.Unix(0, 0)}, f.err
}

func (f *fakeLogStore) AddFile(_ context.Context, _ identity.Principal, sessionID string, input logs.AddFileInput) (logs.SourceFile, error) {
	f.uploaded = input
	payload, _ := ioReadAll(input.Reader)
	f.uploaded.Reader = strings.NewReader(string(payload))
	sourceType := input.SourceType
	if sourceType == "" {
		sourceType = "local"
	}
	return logs.SourceFile{ID: "file_one", SessionID: sessionID, ServiceName: input.ServiceName, NodeName: input.NodeName, OriginalName: input.OriginalName, TotalLines: 1, ParseStatus: "done", SourceType: sourceType}, f.err
}

func (f *fakeLogStore) CreateTailFile(_ context.Context, _ identity.Principal, sessionID string, input logs.CreateTailFileInput) (logs.SourceFile, error) {
	f.tailInput = input
	return logs.SourceFile{ID: "file_tail", SessionID: sessionID, ServiceName: "api", NodeName: "prod", OriginalName: "app.log", ParseStatus: "done", SourceType: "ssh_tail"}, f.err
}

func (f *fakeLogStore) AppendTailLine(_ context.Context, _ identity.Principal, sessionID, sourceFileID, raw string) (logs.Entry, error) {
	f.appended = append(f.appended, raw)
	return logs.Entry{ID: int64(len(f.appended)), SessionID: sessionID, SourceFileID: sourceFileID, Level: "INFO", ServiceName: "api", NodeName: "prod", Message: raw, Raw: raw, LineNumber: len(f.appended)}, f.err
}

func (f *fakeLogStore) Search(context.Context, identity.Principal, string, logs.SearchInput) (logs.SearchResult, error) {
	ts := int64(1_788_897_600_000)
	return logs.SearchResult{Total: 1, CountExact: true, Entries: []logs.Entry{{ID: 1, TimestampMs: &ts, Level: "ERROR", ServiceName: "api", NodeName: "a", Message: "failed", Raw: "failed", LineNumber: 1}}}, f.err
}

func (f *fakeLogStore) Files(context.Context, identity.Principal, string) ([]logs.SourceFile, error) {
	return []logs.SourceFile{{ID: "file_one", SessionID: "logs_one", ServiceName: "api", NodeName: "a", OriginalName: "api-a.log", TotalLines: 1, ParseStatus: "done", SourceType: "local"}}, f.err
}

func (f *fakeLogStore) Tree(context.Context, identity.Principal, string) ([]logs.ServiceScope, error) {
	return []logs.ServiceScope{{ServiceName: "api", LineCount: 1, Nodes: []logs.NodeScope{{NodeName: "a", LineCount: 1}}}}, f.err
}

func (f *fakeLogStore) Timeline(context.Context, identity.Principal, string, int64) ([]logs.TimeBucket, error) {
	return []logs.TimeBucket{{BucketStartMs: 1_788_897_600_000, Count: 1, ErrorCount: 1}}, f.err
}

func (f *fakeLogStore) DeleteSession(context.Context, identity.Principal, string) error {
	return f.err
}

func TestLogRoutesCreateUploadAndSearch(t *testing.T) {
	logStore := &fakeLogStore{}
	router, sessions := newLogTestRouter(t, logStore)
	loginSession := createAuthSession(t, sessions)

	listRR := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/logs/sessions", nil)
	listReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(listRR, listReq)
	if listRR.Code != http.StatusOK || !strings.Contains(listRR.Body.String(), `"id":"logs_one"`) {
		t.Fatalf("list status=%d body=%s", listRR.Code, listRR.Body.String())
	}

	createRR := httptest.NewRecorder()
	createReq := httptest.NewRequest(http.MethodPost, "/api/logs/sessions", strings.NewReader(`{"name":"Deploy","scope":"team","teamId":"team_one"}`))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	createReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(createRR, createReq)
	if createRR.Code != http.StatusCreated || logStore.created.TeamID != "team_one" {
		t.Fatalf("create status=%d body=%s input=%+v", createRR.Code, createRR.Body.String(), logStore.created)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("serviceName", "api")
	_ = writer.WriteField("nodeName", "a")
	part, err := writer.CreateFormFile("file", "api-a.log")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("2026-07-08 10:00:00 ERROR failed\n"))
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	uploadRR := httptest.NewRecorder()
	uploadReq := httptest.NewRequest(http.MethodPost, "/api/logs/sessions/logs_created/upload", &body)
	uploadReq.Header.Set("Content-Type", writer.FormDataContentType())
	uploadReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	uploadReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(uploadRR, uploadReq)
	if uploadRR.Code != http.StatusCreated || logStore.uploaded.OriginalName != "api-a.log" || logStore.uploaded.ServiceName != "api" {
		t.Fatalf("upload status=%d body=%s input=%+v", uploadRR.Code, uploadRR.Body.String(), logStore.uploaded)
	}

	searchRR := httptest.NewRecorder()
	searchReq := httptest.NewRequest(http.MethodGet, "/api/logs/sessions/logs_created/search?query=failed&level=ERROR", nil)
	searchReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(searchRR, searchReq)
	if searchRR.Code != http.StatusOK || !strings.Contains(searchRR.Body.String(), `"message":"failed"`) {
		t.Fatalf("search status=%d body=%s", searchRR.Code, searchRR.Body.String())
	}
}

func TestLogSSHRoutesBrowseAndTail(t *testing.T) {
	logStore := &fakeLogStore{}
	connectionStore := &fakeLogConnectionStore{
		connections: []registry.Connection{{
			ID:       "conn_ssh",
			Name:     "Team SSH",
			Kind:     "ssh",
			Driver:   "ssh",
			Scope:    "team",
			TeamID:   "team_one",
			Endpoint: []byte(`{"host":"logs.internal","port":22}`),
			Config:   []byte(`{}`),
		}},
		secret: registry.Secret{Username: "deploy", Password: "secret"},
	}
	sshService := &fakeLogSSHService{
		browseEntries: []sshlog.RemoteEntry{{Name: "app.log", Path: "/var/log/app.log", Type: "file", Size: 42, ModifiedAt: 1}},
		scanEntries:   []sshlog.RemoteEntry{{Name: "worker.log", Path: "/var/log/service/worker.log", Type: "file", Size: 24, ModifiedAt: 2}},
		tailLines:     []string{"2026-07-08 10:00:00 INFO started", "2026-07-08 10:00:01 ERROR failed"},
		openContent:   "2026-07-08 10:00:00 ERROR imported\n",
	}
	router, sessions := newLogTestRouterWithExtras(t, logStore, connectionStore, sshService)
	loginSession := createAuthSession(t, sessions)

	listRR := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/logs/ssh-connections", nil)
	listReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(listRR, listReq)
	if listRR.Code != http.StatusOK || !strings.Contains(listRR.Body.String(), `"name":"Team SSH"`) {
		t.Fatalf("ssh list status=%d body=%s", listRR.Code, listRR.Body.String())
	}

	browseRR := httptest.NewRecorder()
	browseReq := httptest.NewRequest(http.MethodPost, "/api/logs/ssh/browse", strings.NewReader(`{"connectionId":"conn_ssh","path":"/var/log"}`))
	browseReq.Header.Set("Content-Type", "application/json")
	browseReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	browseReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(browseRR, browseReq)
	if browseRR.Code != http.StatusOK || sshService.browsePath != "/var/log" || !strings.Contains(browseRR.Body.String(), `"app.log"`) {
		t.Fatalf("browse status=%d path=%q body=%s", browseRR.Code, sshService.browsePath, browseRR.Body.String())
	}

	scanRR := httptest.NewRecorder()
	scanReq := httptest.NewRequest(http.MethodPost, "/api/logs/ssh/scan", strings.NewReader(`{"connectionId":"conn_ssh","path":"/var/log","maxDepth":4,"maxFiles":100}`))
	scanReq.Header.Set("Content-Type", "application/json")
	scanReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	scanReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(scanRR, scanReq)
	if scanRR.Code != http.StatusOK || sshService.scanPath != "/var/log" || sshService.scanDepth != 4 || !strings.Contains(scanRR.Body.String(), `"worker.log"`) {
		t.Fatalf("scan status=%d path=%q depth=%d body=%s", scanRR.Code, sshService.scanPath, sshService.scanDepth, scanRR.Body.String())
	}

	importRR := httptest.NewRecorder()
	importReq := httptest.NewRequest(http.MethodPost, "/api/logs/sessions/logs_created/ssh/import", strings.NewReader(`{"connectionId":"conn_ssh","path":"/var/log/app.log","serviceName":"api","nodeName":"prod"}`))
	importReq.Header.Set("Content-Type", "application/json")
	importReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	importReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(importRR, importReq)
	if importRR.Code != http.StatusCreated || sshService.openPath != "/var/log/app.log" || logStore.uploaded.OriginalName != "app.log" || logStore.uploaded.SourceType != "ssh_import" {
		t.Fatalf("import status=%d openPath=%q uploaded=%+v body=%s", importRR.Code, sshService.openPath, logStore.uploaded, importRR.Body.String())
	}

	tailRR := httptest.NewRecorder()
	tailReq := httptest.NewRequest(http.MethodPost, "/api/logs/sessions/logs_created/tail", strings.NewReader(`{"connectionId":"conn_ssh","path":"/var/log/app.log","lines":100,"serviceName":"api","nodeName":"prod"}`))
	tailReq.Header.Set("Content-Type", "application/json")
	tailReq.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	tailReq.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	router.ServeHTTP(tailRR, tailReq)
	if tailRR.Code != http.StatusOK || !strings.Contains(tailRR.Body.String(), `"type":"ready"`) || !strings.Contains(tailRR.Body.String(), `"type":"line"`) {
		t.Fatalf("tail status=%d body=%s", tailRR.Code, tailRR.Body.String())
	}
	if logStore.tailInput.RemotePath != "/var/log/app.log" || len(logStore.appended) != 2 {
		t.Fatalf("tail input=%+v appended=%+v", logStore.tailInput, logStore.appended)
	}
	if connectionStore.usedID != "conn_ssh" || sshService.tailPath != "/var/log/app.log" || sshService.tailLinesCount != 100 {
		t.Fatalf("connection id=%q tail path=%q lines=%d", connectionStore.usedID, sshService.tailPath, sshService.tailLinesCount)
	}
}

func newLogTestRouter(t *testing.T, logStore LogStore) (http.Handler, *identity.Sessions) {
	return newLogTestRouterWithExtras(t, logStore, nil, nil)
}

func newLogTestRouterWithExtras(t *testing.T, logStore LogStore, connectionStore LogConnectionStore, sshService LogSSHService) (http.Handler, *identity.Sessions) {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	sessions := identity.NewSessions(client, time.Hour)
	fake := &fakeIdentity{
		user: identity.User{ID: "usr_alice", Username: "alice", DisplayName: "Alice", SystemRole: "admin"},
		principal: identity.Principal{
			User:  identity.User{ID: "usr_alice", Username: "alice", DisplayName: "Alice", SystemRole: "admin"},
			Teams: map[string]string{"team_one": "admin"},
		},
	}
	return NewRouter(Dependencies{
		Sessions:       connectionSession.NewStore(time.Minute),
		Identity:       fake,
		AuthSessions:   sessions,
		AuthSessionTTL: time.Hour,
		CookieSecure:   true,
		Logs:           logStore,
		LogConnections: connectionStore,
		LogSSH:         sshService,
		ValidateDestination: func(_ context.Context, host string, port uint16) error {
			if host != "logs.internal" || port != 22 {
				t.Fatalf("validated destination host=%q port=%d", host, port)
			}
			return nil
		},
	}), sessions
}

type fakeLogConnectionStore struct {
	connections []registry.Connection
	secret      registry.Secret
	usedID      string
}

func (f *fakeLogConnectionStore) List(context.Context, identity.Principal, string, string) ([]registry.Connection, error) {
	return f.connections, nil
}

func (f *fakeLogConnectionStore) SecretForUse(_ context.Context, _ identity.Principal, id string) (registry.Connection, registry.Secret, error) {
	f.usedID = id
	for _, connection := range f.connections {
		if connection.ID == id {
			return connection, f.secret, nil
		}
	}
	return registry.Connection{}, registry.Secret{}, registry.ErrNotFound
}

type fakeLogSSHService struct {
	browseEntries  []sshlog.RemoteEntry
	scanEntries    []sshlog.RemoteEntry
	browsePath     string
	scanPath       string
	scanDepth      int
	scanMaxFiles   int
	tailLines      []string
	tailPath       string
	tailLinesCount int
	openPath       string
	openContent    string
}

func (f *fakeLogSSHService) Test(context.Context, sshlog.Credentials) error {
	return nil
}

func (f *fakeLogSSHService) Browse(_ context.Context, _ sshlog.Credentials, remotePath string) ([]sshlog.RemoteEntry, error) {
	f.browsePath = remotePath
	return f.browseEntries, nil
}

func (f *fakeLogSSHService) Scan(_ context.Context, _ sshlog.Credentials, remotePath string, maxDepth, maxFiles int) (sshlog.ScanResult, error) {
	f.scanPath = remotePath
	f.scanDepth = maxDepth
	f.scanMaxFiles = maxFiles
	return sshlog.ScanResult{Entries: f.scanEntries, MaxDepth: maxDepth, MaxFiles: maxFiles}, nil
}

func (f *fakeLogSSHService) OpenFile(_ context.Context, _ sshlog.Credentials, remotePath string) (io.ReadCloser, error) {
	f.openPath = remotePath
	return io.NopCloser(strings.NewReader(f.openContent)), nil
}

func (f *fakeLogSSHService) Tail(_ context.Context, _ sshlog.Credentials, remotePath string, lines int, onReady func(), onLine func(string) error) error {
	f.tailPath = remotePath
	f.tailLinesCount = lines
	onReady()
	for _, line := range f.tailLines {
		if err := onLine(line); err != nil {
			return err
		}
	}
	return nil
}

func ioReadAll(reader interface{}) ([]byte, error) {
	r, ok := reader.(interface{ Read([]byte) (int, error) })
	if !ok {
		return nil, nil
	}
	var buffer bytes.Buffer
	_, err := buffer.ReadFrom(r)
	return buffer.Bytes(), err
}
