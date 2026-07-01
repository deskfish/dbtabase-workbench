package registry

import (
	"context"
	"path/filepath"
	"testing"
)

func TestShareAndCopyAreIdempotent(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "registry.db"), "test-secret")
	if err != nil { t.Fatal(err) }
	defer store.Close()
	ctx := context.Background()
	personal, err := store.UpsertPersonal(ctx, "alice", ConnectionRecord{ID:"p1", Name:"main", Driver:"postgres", Host:"10.0.0.2", Port:5432, Database:"app", User:"db", Password:"pw", TLSMode:"disable"})
	if err != nil { t.Fatal(err) }
	firstShare, err := store.SharePersonalToTeam(ctx, "alice", personal.ID)
	if err != nil { t.Fatal(err) }
	secondShare, err := store.SharePersonalToTeam(ctx, "alice", personal.ID)
	if err != nil { t.Fatal(err) }
	if firstShare.ID != secondShare.ID { t.Fatalf("duplicate share: %q != %q", firstShare.ID, secondShare.ID) }

	firstCopy, err := store.CopyTeamToPersonal(ctx, "bob", firstShare.ID)
	if err != nil { t.Fatal(err) }
	secondCopy, err := store.CopyTeamToPersonal(ctx, "bob", firstShare.ID)
	if err != nil { t.Fatal(err) }
	if firstCopy.ID != secondCopy.ID { t.Fatalf("duplicate copy: %q != %q", firstCopy.ID, secondCopy.ID) }
	teams, err := store.ListTeam(ctx)
	if err != nil { t.Fatal(err) }
	if len(teams) != 1 { t.Fatalf("copy removed team record: got %d", len(teams)) }
}
