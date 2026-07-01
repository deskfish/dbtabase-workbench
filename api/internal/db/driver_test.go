package db

import (
	"context"
	"strings"
	"testing"
)

func TestBuildMySQLDSNEncodesDatabaseAndTLS(t *testing.T) {
	dsn, err := buildDSN(ConnectionInput{Driver: MySQL, Host: "10.10.1.2", Port: 3306, Database: "sales data", User: "analyst", Password: "secret", TLSMode: "preferred"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(dsn, "sales%20data") || !strings.Contains(dsn, "tls=preferred") {
		t.Fatalf("DSN missing encoded fields")
	}
}

func TestBuildPostgresDSNDoesNotLeakThroughValidationError(t *testing.T) {
	input := ConnectionInput{Driver: PostgreSQL, Host: "db.internal", Port: 5432, User: "u", Password: "topsecret", TLSMode: "invalid"}
	_, err := buildDSN(input)
	if err == nil || strings.Contains(err.Error(), input.Password) {
		t.Fatalf("unsafe error: %v", err)
	}
}

func TestOpenRejectsUnknownDriverWithoutPasswordLeak(t *testing.T) {
	_, err := Open(context.Background(), ConnectionInput{Driver: "oracle", Password: "topsecret"})
	if err == nil || strings.Contains(err.Error(), "topsecret") {
		t.Fatalf("unsafe error: %v", err)
	}
}
