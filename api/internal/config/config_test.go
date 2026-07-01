package config

import (
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
