package registry

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func TestKeyringBindsCiphertextToConnectionID(t *testing.T) {
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	ring, err := ParseKeyring("v1:"+key, "v1")
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := ring.Seal("conn_a", Secret{Username: "ops", Password: "secret"})
	if err != nil {
		t.Fatal(err)
	}
	opened, err := ring.Open("conn_a", sealed.KeyID, sealed.Ciphertext)
	if err != nil || opened.Password != "secret" {
		t.Fatalf("opened = %+v err = %v", opened, err)
	}
	if _, err := ring.Open("conn_b", sealed.KeyID, sealed.Ciphertext); err == nil {
		t.Fatal("ciphertext replay accepted")
	}
}

func TestParseKeyringRejectsInvalidKeys(t *testing.T) {
	if _, err := ParseKeyring("v1:not-base64", "v1"); err == nil {
		t.Fatal("invalid base64 key accepted")
	}
	short := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 31))
	if _, err := ParseKeyring("v1:"+short, "v1"); err == nil {
		t.Fatal("short key accepted")
	}
	valid := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32))
	if _, err := ParseKeyring("v1:"+valid, "v2"); err == nil {
		t.Fatal("missing active key accepted")
	}
}
