package config

import (
	"net/netip"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(testGetenv(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Address != ":8080" {
		t.Fatalf("Address = %q", cfg.Address)
	}
	if cfg.QueryTimeout != 30*time.Second || cfg.PageSize != 200 || cfg.MaxRows != 10_000 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if len(cfg.AllowedCIDRs) != 0 || len(cfg.AllowedPorts) != 0 {
		t.Fatalf("expected unrestricted defaults, got CIDRs=%v ports=%v", cfg.AllowedCIDRs, cfg.AllowedPorts)
	}
	if !cfg.CookieSecure || cfg.SessionTTL != 12*time.Hour {
		t.Fatalf("unexpected ops console defaults: %+v", cfg)
	}
}

func TestLoadOpsConsolePlatform(t *testing.T) {
	values := map[string]string{
		"OC_DATABASE_URL":          "postgres://ops:secret@localhost:5432/ops",
		"OC_REDIS_URL":             "redis://localhost:6379/0",
		"OC_CREDENTIAL_KEYS":       "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		"OC_ACTIVE_CREDENTIAL_KEY": "v1",
		"OC_COOKIE_SECURE":         "false",
		"OC_SESSION_TTL":           "12h",
		"OC_SCHEMA_SECRET":         "schema-secret",
	}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PostgresURL != values["OC_DATABASE_URL"] || cfg.RedisURL != values["OC_REDIS_URL"] {
		t.Fatalf("unexpected URLs: %+v", cfg)
	}
	if cfg.CredentialKeys != values["OC_CREDENTIAL_KEYS"] || cfg.ActiveCredentialKey != "v1" || cfg.CookieSecure || cfg.SessionTTL != 12*time.Hour || cfg.SchemaSecret != "schema-secret" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestLoadRejectsMissingCredentialKey(t *testing.T) {
	_, err := Load(func(key string) string {
		values := map[string]string{
			"OC_DATABASE_URL": "postgres://ops@localhost/ops",
			"OC_REDIS_URL":    "redis://localhost:6379/0",
		}
		return values[key]
	})
	if err == nil {
		t.Fatal("expected missing credential key error")
	}
}

func TestLoadRejectsIncompleteBootstrapAdmin(t *testing.T) {
	_, err := Load(testGetenv(map[string]string{"OC_BOOTSTRAP_ADMIN_USER": "admin"}))
	if err == nil {
		t.Fatal("expected incomplete bootstrap admin error")
	}
}

func TestLoadRejectsInvalidInteger(t *testing.T) {
	_, err := Load(func(key string) string {
		if key == "DBW_PAGE_SIZE" {
			return "many"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected invalid page size error")
	}
}

func TestLoadParsesDestinationAllowlist(t *testing.T) {
	cfg, err := Load(testGetenv(map[string]string{
		"DBW_ALLOWED_CIDRS":    "10.10.0.0/16, 192.168.20.0/24",
		"DBW_ALLOWED_PORTS":    "3306,5432",
		"DBW_ALLOWED_SUFFIXES": ".corp.example,.internal",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.AllowedCIDRs) != 2 || cfg.AllowedCIDRs[0] != netip.MustParsePrefix("10.10.0.0/16") {
		t.Fatalf("CIDRs = %v", cfg.AllowedCIDRs)
	}
	if _, ok := cfg.AllowedPorts[5432]; !ok {
		t.Fatalf("ports = %v", cfg.AllowedPorts)
	}
	if len(cfg.AllowedSuffixes) != 2 || cfg.AllowedSuffixes[1] != ".internal" {
		t.Fatalf("suffixes = %v", cfg.AllowedSuffixes)
	}
}

func testGetenv(overrides map[string]string) func(string) string {
	values := map[string]string{
		"OC_DATABASE_URL":          "postgres://ops@localhost/ops",
		"OC_REDIS_URL":             "redis://localhost:6379/0",
		"OC_CREDENTIAL_KEYS":       "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		"OC_ACTIVE_CREDENTIAL_KEY": "v1",
	}
	for key, value := range overrides {
		values[key] = value
	}
	return func(key string) string { return values[key] }
}
