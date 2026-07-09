package registry

import (
	"context"
	"encoding/base64"
	"encoding/json"
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

func TestPGStoreAuthorizationAndSecretUseIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	fixture := registryIntegration(t, ctx)

	personal, err := fixture.store.Create(ctx, fixture.alice, SaveInput{
		Connection: Connection{ID: "conn_personal", Name: "Personal DB", Kind: "database", Driver: "postgres", Scope: "personal", Endpoint: rawJSON(`{"host":"db.local","port":5432}`), Config: rawJSON(`{"database":"app"}`)},
		Secret:     &Secret{Username: "alice_db", Password: "secret-one"},
	})
	if err != nil {
		t.Fatalf("create personal: %v", err)
	}
	if personal.OwnerUserID != fixture.alice.User.ID || !personal.HasSecret {
		t.Fatalf("personal = %+v", personal)
	}
	if _, err := fixture.store.Update(ctx, fixture.bob, personal.ID, SaveInput{Connection: personal}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bob personal update error = %v, want %v", err, ErrNotFound)
	}

	personal.Name = "Personal DB Renamed"
	updated, err := fixture.store.Update(ctx, fixture.alice, personal.ID, SaveInput{Connection: personal})
	if err != nil {
		t.Fatalf("update personal metadata: %v", err)
	}
	if updated.Name != "Personal DB Renamed" {
		t.Fatalf("updated = %+v", updated)
	}
	_, preserved, err := fixture.store.SecretForUse(ctx, fixture.alice, personal.ID)
	if err != nil {
		t.Fatalf("open preserved personal secret: %v", err)
	}
	if preserved.Password != "secret-one" {
		t.Fatalf("preserved password = %q", preserved.Password)
	}

	teamConn, err := fixture.store.Create(ctx, fixture.alice, SaveInput{
		Connection: Connection{ID: "conn_team", Name: "Team SSH", Kind: "ssh", Driver: "ssh", Scope: "team", TeamID: fixture.team.ID, Endpoint: rawJSON(`{"host":"bastion.local","port":22}`), Config: rawJSON(`{}`)},
		Secret:     &Secret{Username: "ops", PrivateKey: "private-key"},
	})
	if err != nil {
		t.Fatalf("team admin create: %v", err)
	}
	if teamConn.TeamID != fixture.team.ID || !teamConn.HasSecret {
		t.Fatalf("team connection = %+v", teamConn)
	}
	teamConn.Name = "Team SSH Renamed"
	teamConn, err = fixture.store.Update(ctx, fixture.alice, teamConn.ID, SaveInput{Connection: teamConn})
	if err != nil {
		t.Fatalf("team admin update: %v", err)
	}
	if teamConn.Name != "Team SSH Renamed" {
		t.Fatalf("team update = %+v", teamConn)
	}
	if _, err := fixture.store.Update(ctx, fixture.bob, teamConn.ID, SaveInput{Connection: teamConn}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("team member update error = %v, want %v", err, ErrForbidden)
	}
	_, teamSecret, err := fixture.store.SecretForUse(ctx, fixture.bob, teamConn.ID)
	if err != nil {
		t.Fatalf("team member secret use: %v", err)
	}
	if teamSecret.PrivateKey != "private-key" {
		t.Fatalf("team secret = %+v", teamSecret)
	}
	if _, _, err := fixture.store.SecretForUse(ctx, fixture.outsider, teamConn.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("non-member secret use error = %v, want %v", err, ErrForbidden)
	}

	idStore := identity.NewStore(fixture.pool)
	otherAdminUser, err := idStore.CreateUser(ctx, fixture.root, "other-admin", "Other Admin", "password", "admin")
	if err != nil {
		t.Fatalf("create other admin: %v", err)
	}
	otherAdmin, err := idStore.PrincipalForUser(ctx, otherAdminUser.ID)
	if err != nil {
		t.Fatalf("load other admin principal: %v", err)
	}
	otherTeam, err := idStore.CreateTeam(ctx, otherAdmin, "Other Team")
	if err != nil {
		t.Fatalf("create other team: %v", err)
	}
	otherAdmin, err = idStore.PrincipalForUser(ctx, otherAdminUser.ID)
	if err != nil {
		t.Fatalf("reload other admin principal: %v", err)
	}
	otherTeamConn, err := fixture.store.Create(ctx, otherAdmin, SaveInput{
		Connection: Connection{ID: "conn_other_team", Name: "Other Team SSH", Kind: "ssh", Driver: "ssh", Scope: "team", TeamID: otherTeam.ID, Endpoint: rawJSON(`{"host":"other-bastion.local","port":22}`), Config: rawJSON(`{}`)},
		Secret:     &Secret{Username: "ops", PrivateKey: "other-private-key"},
	})
	if err != nil {
		t.Fatalf("other team admin create: %v", err)
	}
	rootList, err := fixture.store.List(ctx, fixture.root, "", "")
	if err != nil {
		t.Fatalf("system admin list: %v", err)
	}
	if !hasConnection(rootList, teamConn.ID) || !hasConnection(rootList, otherTeamConn.ID) {
		t.Fatalf("system admin list = %+v, want both team connections", rootList)
	}
	if hasConnection(rootList, personal.ID) {
		t.Fatalf("system admin list leaked personal connection: %+v", rootList)
	}
	if _, rootSecret, err := fixture.store.SecretForUse(ctx, fixture.root, otherTeamConn.ID); err != nil || rootSecret.PrivateKey != "other-private-key" {
		t.Fatalf("system admin team secret use secret=%+v err=%v", rootSecret, err)
	}

	aliceList, err := fixture.store.List(ctx, fixture.alice, "", "")
	if err != nil {
		t.Fatalf("alice list: %v", err)
	}
	if len(aliceList) != 2 {
		t.Fatalf("alice list = %+v", aliceList)
	}
	bobList, err := fixture.store.List(ctx, fixture.bob, "", "")
	if err != nil {
		t.Fatalf("bob list: %v", err)
	}
	if len(bobList) != 1 || bobList[0].ID != teamConn.ID {
		t.Fatalf("bob list = %+v", bobList)
	}
	outsideList, err := fixture.store.List(ctx, fixture.outsider, "", "")
	if err != nil {
		t.Fatalf("outsider list: %v", err)
	}
	if len(outsideList) != 0 {
		t.Fatalf("outsider list = %+v", outsideList)
	}

	encoded, err := json.Marshal(aliceList)
	if err != nil {
		t.Fatal(err)
	}
	lower := strings.ToLower(string(encoded))
	for _, forbidden := range []string{"secret-one", "private-key", "ciphertext", "password"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("connection JSON leaked %q: %s", forbidden, encoded)
		}
	}

	var audits int
	if err := fixture.pool.QueryRow(ctx, "SELECT count(*) FROM audit_events WHERE resource_type = 'connection'").Scan(&audits); err != nil {
		t.Fatalf("count audits: %v", err)
	}
	if audits < 5 {
		t.Fatalf("audit rows = %d, want at least 5", audits)
	}
	if err := fixture.store.Delete(ctx, fixture.alice, personal.ID); err != nil {
		t.Fatalf("owner delete personal: %v", err)
	}
	if _, _, err := fixture.store.SecretForUse(ctx, fixture.alice, personal.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted personal secret error = %v, want %v", err, ErrNotFound)
	}
}

func TestPGStoreCreateRequiresSecretIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	fixture := registryIntegration(t, ctx)

	_, err := fixture.store.Create(ctx, fixture.alice, SaveInput{
		Connection: Connection{ID: "conn_no_secret", Name: "No Secret", Kind: "database", Driver: "postgres", Scope: "personal", Endpoint: rawJSON(`{}`), Config: rawJSON(`{}`)},
	})
	if err == nil {
		t.Fatal("create without secret succeeded")
	}
	_, err = fixture.store.Create(ctx, fixture.alice, SaveInput{
		Connection: Connection{ID: "conn_empty_secret", Name: "Empty Secret", Kind: "database", Driver: "postgres", Scope: "personal", Endpoint: rawJSON(`{}`), Config: rawJSON(`{}`)},
		Secret:     &Secret{},
	})
	if err == nil {
		t.Fatal("create with empty secret succeeded")
	}
}

type registryFixture struct {
	pool     *pgxpool.Pool
	store    *PGStore
	team     identity.Team
	root     identity.Principal
	alice    identity.Principal
	bob      identity.Principal
	outsider identity.Principal
}

func registryIntegration(t *testing.T, ctx context.Context) registryFixture {
	t.Helper()
	databaseURL := os.Getenv("OC_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("OC_TEST_DATABASE_URL is not configured; skipping PostgreSQL registry integration test")
	}

	adminPool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	schema := fmt.Sprintf("registry_test_%d", time.Now().UnixNano())
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

	idStore := identity.NewStore(pool)
	if err := idStore.BootstrapAdmin(ctx, "root", "password"); err != nil {
		t.Fatalf("bootstrap root: %v", err)
	}
	rootUser, err := idStore.Authenticate(ctx, "root", "password")
	if err != nil {
		t.Fatalf("authenticate root: %v", err)
	}
	root, err := idStore.PrincipalForUser(ctx, rootUser.ID)
	if err != nil {
		t.Fatalf("load root principal: %v", err)
	}
	aliceUser, err := idStore.CreateUser(ctx, root, "alice", "Alice", "password", "member")
	if err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bobUser, err := idStore.CreateUser(ctx, root, "bob", "Bob", "password", "member")
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}
	outsiderUser, err := idStore.CreateUser(ctx, root, "outsider", "Outsider", "password", "member")
	if err != nil {
		t.Fatalf("create outsider: %v", err)
	}
	team, err := idStore.CreateTeam(ctx, root, "Team One")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	if err := idStore.AddTeamMember(ctx, root, team.ID, aliceUser.ID, "admin"); err != nil {
		t.Fatalf("add alice admin: %v", err)
	}
	if err := idStore.AddTeamMember(ctx, root, team.ID, bobUser.ID, "member"); err != nil {
		t.Fatalf("add bob member: %v", err)
	}
	alice, err := idStore.PrincipalForUser(ctx, aliceUser.ID)
	if err != nil {
		t.Fatalf("load alice principal: %v", err)
	}
	bob, err := idStore.PrincipalForUser(ctx, bobUser.ID)
	if err != nil {
		t.Fatalf("load bob principal: %v", err)
	}
	outsider, err := idStore.PrincipalForUser(ctx, outsiderUser.ID)
	if err != nil {
		t.Fatalf("load outsider principal: %v", err)
	}

	key := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	ring, err := ParseKeyring("v1:"+key, "v1")
	if err != nil {
		t.Fatalf("parse keyring: %v", err)
	}
	return registryFixture{
		pool:     pool,
		store:    NewPGStore(pool, ring),
		team:     team,
		root:     root,
		alice:    alice,
		bob:      bob,
		outsider: outsider,
	}
}

func rawJSON(value string) json.RawMessage {
	return json.RawMessage(value)
}

func hasConnection(connections []Connection, id string) bool {
	for _, connection := range connections {
		if connection.ID == id {
			return true
		}
	}
	return false
}
