package config

import (
	"net/netip"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Address != ":8080" {
		t.Fatalf("Address = %q", cfg.Address)
	}
	if cfg.QueryTimeout != 30*time.Second || cfg.PageSize != 200 || cfg.MaxRows != 10_000 {
		t.Fatalf("unexpected defaults: %+v", cfg)
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
	cfg, err := Load(func(key string) string {
		switch key {
		case "DBW_ALLOWED_CIDRS":
			return "10.10.0.0/16, 192.168.20.0/24"
		case "DBW_ALLOWED_PORTS":
			return "3306,5432"
		case "DBW_ALLOWED_SUFFIXES":
			return ".corp.example,.internal"
		default:
			return ""
		}
	})
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
