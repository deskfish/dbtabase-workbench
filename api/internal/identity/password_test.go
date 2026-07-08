package identity

import (
	"strings"
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	encoded, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(encoded, "$argon2id$v=19$") {
		t.Fatalf("hash = %q", encoded)
	}
	if !VerifyPassword("correct horse battery staple", encoded) {
		t.Fatal("correct password rejected")
	}
	if VerifyPassword("wrong", encoded) {
		t.Fatal("wrong password accepted")
	}
}

func TestVerifyPasswordRejectsMalformedPHCEncoding(t *testing.T) {
	encoded, err := HashPassword("password")
	if err != nil {
		t.Fatal(err)
	}

	tests := []string{
		strings.Replace(encoded, "$argon2id$", "$argon2i$", 1),
		strings.Replace(encoded, "$v=19$", "$v=18$", 1),
		strings.Replace(encoded, "$m=65536,t=3,p=2$", "$m=65536,t=3,p=2,junk$", 1),
		strings.Replace(encoded, "$m=65536,t=3,p=2$", "$m=32768,t=3,p=2$", 1),
		encoded + "=",
	}
	for _, malformed := range tests {
		if VerifyPassword("password", malformed) {
			t.Fatalf("accepted malformed hash %q", malformed)
		}
	}
}
