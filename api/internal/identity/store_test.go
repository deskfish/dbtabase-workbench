package identity

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"dbworkbench/api/internal/migrate"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestBootstrapAndAuthenticateIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, pool := integrationStore(t, ctx)

	if err := store.BootstrapAdmin(ctx, "  Alice  ", "correct horse battery staple"); err != nil {
		t.Fatalf("first bootstrap: %v", err)
	}
	if err := store.BootstrapAdmin(ctx, "bob", "password"); !errors.Is(err, ErrAlreadyBootstrapped) {
		t.Fatalf("second bootstrap error = %v, want %v", err, ErrAlreadyBootstrapped)
	}

	user, err := store.Authenticate(ctx, "ALICE", "correct horse battery staple")
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if user.Username != "alice" || user.DisplayName != "alice" || user.SystemRole != "admin" || user.Disabled {
		t.Fatalf("user = %+v", user)
	}
	if _, err := store.Authenticate(ctx, "alice", "wrong"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password error = %v, want %v", err, ErrInvalidCredentials)
	}

	if _, err := pool.Exec(ctx, "UPDATE users SET disabled_at = now() WHERE id = $1", user.ID); err != nil {
		t.Fatalf("disable user: %v", err)
	}
	if _, err := store.Authenticate(ctx, "alice", "correct horse battery staple"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("disabled login error = %v, want %v", err, ErrInvalidCredentials)
	}
}

func TestConcurrentBootstrapCreatesExactlyOneAdminIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, pool := integrationStore(t, ctx)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for _, username := range []string{"alice", "bob"} {
		go func() {
			ready.Done()
			<-start
			errs <- store.BootstrapAdmin(ctx, username, "password")
		}()
	}
	ready.Wait()
	close(start)

	var succeeded, alreadyBootstrapped int
	for range 2 {
		switch err := <-errs; {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrAlreadyBootstrapped):
			alreadyBootstrapped++
		default:
			t.Fatalf("bootstrap error = %v", err)
		}
	}
	if succeeded != 1 || alreadyBootstrapped != 1 {
		t.Fatalf("succeeded = %d, already bootstrapped = %d", succeeded, alreadyBootstrapped)
	}

	var users int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&users); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if users != 1 {
		t.Fatalf("users = %d, want 1", users)
	}
}

func TestUserAndTeamAuthorizationIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	store, _ := integrationStore(t, ctx)

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

	memberUser, err := store.CreateUser(ctx, root, "  MEMBER  ", "Member User", "password", "member")
	if err != nil {
		t.Fatal(err)
	}
	if memberUser.Username != "member" {
		t.Fatalf("normalized username = %q", memberUser.Username)
	}
	member, err := store.PrincipalForUser(ctx, memberUser.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateUser(ctx, member, "denied", "Denied", "password", "member"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member CreateUser error = %v, want %v", err, ErrForbidden)
	}
	if _, err := store.CreateTeam(ctx, member, "denied"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member CreateTeam error = %v, want %v", err, ErrForbidden)
	}

	teamOne, err := store.CreateTeam(ctx, root, "Team One")
	if err != nil {
		t.Fatal(err)
	}
	teamTwo, err := store.CreateTeam(ctx, root, "Team Two")
	if err != nil {
		t.Fatal(err)
	}
	if teamOne.Role != "admin" || teamTwo.Role != "admin" {
		t.Fatalf("created teams = %+v, %+v", teamOne, teamTwo)
	}

	target, err := store.CreateUser(ctx, root, "target", "Target", "password", "member")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AddTeamMember(ctx, member, teamOne.ID, target.ID, "member"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("ordinary member AddTeamMember error = %v, want %v", err, ErrForbidden)
	}

	teamAdminUser, err := store.CreateUser(ctx, root, "team-admin", "Team Admin", "password", "member")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AddTeamMember(ctx, root, teamOne.ID, teamAdminUser.ID, "admin"); err != nil {
		t.Fatal(err)
	}
	teamAdmin, err := store.PrincipalForUser(ctx, teamAdminUser.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AddTeamMember(ctx, teamAdmin, teamOne.ID, target.ID, "member"); err != nil {
		t.Fatalf("target team admin add: %v", err)
	}
	if err := store.AddTeamMember(ctx, teamAdmin, teamTwo.ID, target.ID, "member"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unrelated team admin error = %v, want %v", err, ErrForbidden)
	}

	targetPrincipal, err := store.PrincipalForUser(ctx, target.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(targetPrincipal.Teams) != 1 || targetPrincipal.Teams[teamOne.ID] != "member" {
		t.Fatalf("target teams = %#v", targetPrincipal.Teams)
	}
	if _, ok := targetPrincipal.Teams[teamTwo.ID]; ok {
		t.Fatalf("target received unrelated team permission: %#v", targetPrincipal.Teams)
	}
}

func integrationStore(t *testing.T, ctx context.Context) (*Store, *pgxpool.Pool) {
	t.Helper()
	databaseURL := os.Getenv("OC_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("OC_TEST_DATABASE_URL is not configured; skipping PostgreSQL identity integration test")
	}

	adminPool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	schema := fmt.Sprintf("identity_test_%d", time.Now().UnixNano())
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
	return NewStore(pool), pool
}
