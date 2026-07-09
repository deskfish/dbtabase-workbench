package logs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/migrate"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestStoreIndexesSearchesAndIsolatesByOwnerIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool := logsIntegrationPool(t, ctx)
	idStore, root := bootstrapLogIdentity(t, ctx, pool)
	store := NewStore(pool, t.TempDir())

	aliceUser, err := idStore.CreateUser(ctx, root, "alice", "Alice", "password", "member")
	if err != nil {
		t.Fatal(err)
	}
	alice, err := idStore.PrincipalForUser(ctx, aliceUser.ID)
	if err != nil {
		t.Fatal(err)
	}
	bobUser, err := idStore.CreateUser(ctx, root, "bob", "Bob", "password", "member")
	if err != nil {
		t.Fatal(err)
	}
	bob, err := idStore.PrincipalForUser(ctx, bobUser.ID)
	if err != nil {
		t.Fatal(err)
	}

	session, err := store.CreateSession(ctx, alice, CreateSessionInput{Name: "Alice Upload", Scope: "personal"})
	if err != nil {
		t.Fatalf("create personal session: %v", err)
	}
	if _, err := store.AddFile(ctx, alice, session.ID, AddFileInput{
		OriginalName: "orders-node1.log",
		ServiceName:  "orders",
		NodeName:     "node1",
		Reader: strings.NewReader("2026-07-08 10:00:00 INFO booted\n" +
			"2026-07-08 10:01:00 ERROR failed payment\n" +
			"continued stack line\n"),
	}); err != nil {
		t.Fatalf("add file: %v", err)
	}

	result, err := store.Search(ctx, alice, session.ID, SearchInput{Query: "failed", Levels: []string{"ERROR"}, Limit: 20})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if result.Total != 1 || len(result.Entries) != 1 || result.Entries[0].Level != "ERROR" || !strings.Contains(result.Entries[0].Message, "failed payment") {
		t.Fatalf("search result = %+v", result)
	}
	if len(result.Tree) != 1 || result.Tree[0].ServiceName != "orders" || result.Tree[0].Nodes[0].NodeName != "node1" {
		t.Fatalf("tree = %+v", result.Tree)
	}
	timeline, err := store.Timeline(ctx, alice, session.ID, 60_000)
	if err != nil {
		t.Fatalf("timeline: %v", err)
	}
	if len(timeline) != 2 {
		t.Fatalf("timeline = %+v", timeline)
	}
	if _, err := store.Search(ctx, bob, session.ID, SearchInput{}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bob personal search err = %v, want %v", err, ErrNotFound)
	}

	team, err := idStore.CreateTeam(ctx, root, "Team Logs")
	if err != nil {
		t.Fatal(err)
	}
	if err := idStore.AddTeamMember(ctx, root, team.ID, alice.User.ID, "admin"); err != nil {
		t.Fatal(err)
	}
	if err := idStore.AddTeamMember(ctx, root, team.ID, bob.User.ID, "member"); err != nil {
		t.Fatal(err)
	}
	alice, err = idStore.PrincipalForUser(ctx, alice.User.ID)
	if err != nil {
		t.Fatal(err)
	}
	bob, err = idStore.PrincipalForUser(ctx, bob.User.ID)
	if err != nil {
		t.Fatal(err)
	}
	teamSession, err := store.CreateSession(ctx, alice, CreateSessionInput{Name: "Team Upload", Scope: "team", TeamID: team.ID})
	if err != nil {
		t.Fatalf("create team session: %v", err)
	}
	if _, err := store.AddFile(ctx, alice, teamSession.ID, AddFileInput{
		OriginalName: "api-a.log",
		ServiceName:  "api",
		NodeName:     "a",
		Reader:       strings.NewReader("2026-07-08T10:03:00Z WARN retry later\n"),
	}); err != nil {
		t.Fatalf("add team file: %v", err)
	}
	if _, err := store.Search(ctx, bob, teamSession.ID, SearchInput{Query: "retry"}); err != nil {
		t.Fatalf("team member search: %v", err)
	}
	rootList, err := store.ListSessions(ctx, root)
	if err != nil {
		t.Fatalf("system admin list: %v", err)
	}
	if !hasLogSession(rootList, teamSession.ID) || hasLogSession(rootList, session.ID) {
		t.Fatalf("system admin sessions = %+v", rootList)
	}
}

func TestStorePersistsSSHTailLinesIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool := logsIntegrationPool(t, ctx)
	_, root := bootstrapLogIdentity(t, ctx, pool)
	store := NewStore(pool, t.TempDir())

	session, err := store.CreateSession(ctx, root, CreateSessionInput{Name: "Tail", Scope: "personal"})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	source, err := store.CreateTailFile(ctx, root, session.ID, CreateTailFileInput{
		RemotePath:  "/var/log/app.log",
		ServiceName: "api",
		NodeName:    "prod-a",
	})
	if err != nil {
		t.Fatalf("create tail file: %v", err)
	}
	if source.SourceType != "ssh_tail" || source.OriginalName != "app.log" {
		t.Fatalf("source=%+v", source)
	}
	if _, err := store.AppendTailLine(ctx, root, session.ID, source.ID, "2026-07-08 10:00:00 INFO booted"); err != nil {
		t.Fatalf("append first line: %v", err)
	}
	if _, err := store.AppendTailLine(ctx, root, session.ID, source.ID, "continued detail"); err != nil {
		t.Fatalf("append continuation line: %v", err)
	}
	result, err := store.Search(ctx, root, session.ID, SearchInput{Query: "continued", Limit: 20})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if result.Total != 1 || len(result.Entries) != 1 || result.Entries[0].TimestampMs == nil || result.Entries[0].LineNumber != 2 {
		t.Fatalf("search result=%+v", result)
	}
	tree, err := store.Tree(ctx, root, session.ID)
	if err != nil {
		t.Fatalf("tree: %v", err)
	}
	if len(tree) != 1 || tree[0].LineCount != 2 || tree[0].Nodes[0].NodeName != "prod-a" {
		t.Fatalf("tree=%+v", tree)
	}
	files, err := store.Files(ctx, root, session.ID)
	if err != nil {
		t.Fatalf("files: %v", err)
	}
	if len(files) != 1 || files[0].TotalLines != 2 || files[0].SourceType != "ssh_tail" {
		t.Fatalf("files=%+v", files)
	}
}

func logsIntegrationPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("OC_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("OC_TEST_DATABASE_URL is not configured; skipping PostgreSQL logs integration test")
	}

	adminPool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	schema := fmt.Sprintf("logs_test_%d", time.Now().UnixNano())
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := adminPool.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		adminPool.Close()
		t.Fatalf("create test schema: %v", err)
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		adminPool.Close()
		t.Fatalf("parse test database URL: %v", err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		adminPool.Close()
		t.Fatalf("open schema-scoped pool: %v", err)
	}
	if err := migrate.Apply(ctx, pool); err != nil {
		pool.Close()
		adminPool.Close()
		t.Fatalf("apply migrations: %v", err)
	}
	t.Cleanup(func() {
		pool.Close()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if _, err := adminPool.Exec(cleanupCtx, "DROP SCHEMA "+identifier+" CASCADE"); err != nil {
			t.Errorf("drop test schema: %v", err)
		}
		adminPool.Close()
	})
	return pool
}

func bootstrapLogIdentity(t *testing.T, ctx context.Context, pool *pgxpool.Pool) (*identity.Store, identity.Principal) {
	t.Helper()
	store := identity.NewStore(pool)
	if err := store.BootstrapAdmin(ctx, "root", "password"); err != nil {
		t.Fatal(err)
	}
	rootUser, err := store.Authenticate(ctx, "root", "password")
	if err != nil {
		t.Fatal(err)
	}
	root, err := store.PrincipalForUser(ctx, rootUser.ID)
	if err != nil {
		t.Fatal(err)
	}
	return store, root
}

func hasLogSession(sessions []Session, id string) bool {
	for _, session := range sessions {
		if session.ID == id {
			return true
		}
	}
	return false
}
