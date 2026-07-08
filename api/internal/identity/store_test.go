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
	"github.com/jackc/pgx/v5/pgconn"
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

func TestIdentityStoreErrorMapping(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want error
	}{
		{
			name: "unique violation maps to conflict",
			err:  &pgconn.PgError{Code: "23505", ConstraintName: "users_username_key"},
			want: ErrConflict,
		},
		{
			name: "check violation maps to invalid",
			err:  &pgconn.PgError{Code: "23514", ConstraintName: "users_system_role_check"},
			want: ErrInvalid,
		},
		{
			name: "foreign key violation maps to not found",
			err:  &pgconn.PgError{Code: "23503", ConstraintName: "team_members_user_id_fkey"},
			want: ErrNotFound,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mapStoreError("operation", tt.err)
			if !errors.Is(got, tt.want) {
				t.Fatalf("error = %v, want errors.Is(..., %v)", got, tt.want)
			}
		})
	}
}

func TestCreateUserRejectsActorRevokedBeforeMutationIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	store, pool := integrationStore(t, ctx)
	root := bootstrapRootPrincipal(t, ctx, store)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin revocation transaction: %v", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "UPDATE users SET system_role = 'member', disabled_at = now() WHERE id = $1", root.User.ID); err != nil {
		t.Fatalf("stage actor revocation: %v", err)
	}

	errs := make(chan error, 1)
	go func() {
		_, err := store.CreateUser(ctx, root, "late-user", "Late User", "password", "member")
		errs <- err
	}()

	select {
	case err := <-errs:
		t.Fatalf("CreateUser returned before revocation committed with error %v; want it to wait for actor lock", err)
	case <-time.After(200 * time.Millisecond):
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit actor revocation: %v", err)
	}
	select {
	case err := <-errs:
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("CreateUser error = %v, want %v", err, ErrForbidden)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("CreateUser did not finish after revocation committed")
	}

	var created int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE username = 'late-user'").Scan(&created); err != nil {
		t.Fatalf("count late user: %v", err)
	}
	if created != 0 {
		t.Fatalf("late user rows = %d, want 0", created)
	}
}

func TestCreateTeamRejectsActorRevokedBeforeMutationIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	store, pool := integrationStore(t, ctx)
	root := bootstrapRootPrincipal(t, ctx, store)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin revocation transaction: %v", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "UPDATE users SET system_role = 'member', disabled_at = now() WHERE id = $1", root.User.ID); err != nil {
		t.Fatalf("stage actor revocation: %v", err)
	}

	errs := make(chan error, 1)
	go func() {
		_, err := store.CreateTeam(ctx, root, "Late Team")
		errs <- err
	}()

	select {
	case err := <-errs:
		t.Fatalf("CreateTeam returned before revocation committed with error %v; want it to wait for actor lock", err)
	case <-time.After(200 * time.Millisecond):
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit actor revocation: %v", err)
	}
	select {
	case err := <-errs:
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("CreateTeam error = %v, want %v", err, ErrForbidden)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("CreateTeam did not finish after revocation committed")
	}

	var created int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM teams WHERE name = 'Late Team'").Scan(&created); err != nil {
		t.Fatalf("count late team: %v", err)
	}
	if created != 0 {
		t.Fatalf("late team rows = %d, want 0", created)
	}
}

func TestIdentityConstraintErrorsIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	store, _ := integrationStore(t, ctx)
	root := bootstrapRootPrincipal(t, ctx, store)

	if _, err := store.CreateUser(ctx, root, "duplicate", "Duplicate", "password", "member"); err != nil {
		t.Fatalf("create first duplicate user: %v", err)
	}
	if _, err := store.CreateUser(ctx, root, "DUPLICATE", "Duplicate", "password", "member"); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate username error = %v, want %v", err, ErrConflict)
	}
	if _, err := store.CreateUser(ctx, root, "bad-role", "Bad Role", "password", "owner"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid user role error = %v, want %v", err, ErrInvalid)
	}

	team, err := store.CreateTeam(ctx, root, "Duplicate Team")
	if err != nil {
		t.Fatalf("create first duplicate team: %v", err)
	}
	if _, err := store.CreateTeam(ctx, root, "Duplicate Team"); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate team error = %v, want %v", err, ErrConflict)
	}
	target, err := store.CreateUser(ctx, root, "target-for-errors", "Target", "password", "member")
	if err != nil {
		t.Fatalf("create target user: %v", err)
	}
	if err := store.AddTeamMember(ctx, root, team.ID, target.ID, "owner"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid team member role error = %v, want %v", err, ErrInvalid)
	}
	if err := store.AddTeamMember(ctx, root, team.ID, "usr_missing", "member"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing member user error = %v, want %v", err, ErrNotFound)
	}
	if err := store.AddTeamMember(ctx, root, "team_missing", target.ID, "member"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing team error = %v, want %v", err, ErrNotFound)
	}
}

func bootstrapRootPrincipal(t *testing.T, ctx context.Context, store *Store) Principal {
	t.Helper()
	if err := store.BootstrapAdmin(ctx, "root", "password"); err != nil {
		t.Fatalf("bootstrap root: %v", err)
	}
	rootUser, err := store.Authenticate(ctx, "root", "password")
	if err != nil {
		t.Fatalf("authenticate root: %v", err)
	}
	root, err := store.PrincipalForUser(ctx, rootUser.ID)
	if err != nil {
		t.Fatalf("load root principal: %v", err)
	}
	return root
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
