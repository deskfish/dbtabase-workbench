package config

import (
	"fmt"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address                string
	QueryTimeout           time.Duration
	PageSize               int
	MaxRows                int
	AllowedCIDRs           []netip.Prefix
	AllowedPorts           map[uint16]struct{}
	AllowedSuffixes        []string
	SchemaSecret           string
	PostgresURL            string
	RedisURL               string
	CredentialKeys         string
	ActiveCredentialKey    string
	CookieSecure           bool
	SessionTTL             time.Duration
	BootstrapAdminUser     string
	BootstrapAdminPassword string
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Address:      stringValue(getenv("DBW_ADDRESS"), ":8080"),
		QueryTimeout: 30 * time.Second,
		PageSize:     200,
		MaxRows:      10_000,
		CookieSecure: true,
		SessionTTL:   12 * time.Hour,
	}

	var err error
	if cfg.PageSize, err = positiveInt(getenv("DBW_PAGE_SIZE"), cfg.PageSize); err != nil {
		return Config{}, fmt.Errorf("DBW_PAGE_SIZE: %w", err)
	}
	if cfg.MaxRows, err = positiveInt(getenv("DBW_MAX_ROWS"), cfg.MaxRows); err != nil {
		return Config{}, fmt.Errorf("DBW_MAX_ROWS: %w", err)
	}
	if value := getenv("DBW_QUERY_TIMEOUT"); value != "" {
		cfg.QueryTimeout, err = time.ParseDuration(value)
		if err != nil || cfg.QueryTimeout <= 0 {
			return Config{}, fmt.Errorf("DBW_QUERY_TIMEOUT must be a positive duration")
		}
	}
	if value := getenv("DBW_ALLOWED_CIDRS"); value != "" {
		cfg.AllowedCIDRs, err = parseCIDRs(value)
		if err != nil {
			return Config{}, fmt.Errorf("DBW_ALLOWED_CIDRS: %w", err)
		}
	}
	if value := getenv("DBW_ALLOWED_PORTS"); value != "" {
		cfg.AllowedPorts, err = parsePorts(value)
		if err != nil {
			return Config{}, fmt.Errorf("DBW_ALLOWED_PORTS: %w", err)
		}
	}
	if value := getenv("DBW_ALLOWED_SUFFIXES"); value != "" {
		cfg.AllowedSuffixes = splitList(value)
	}
	cfg.SchemaSecret = stringValue(getenv("OC_SCHEMA_SECRET"), "database-workbench-ephemeral-schema-secret")
	if cfg.PostgresURL, err = requiredValue(getenv("OC_DATABASE_URL")); err != nil {
		return Config{}, fmt.Errorf("OC_DATABASE_URL: %w", err)
	}
	if cfg.RedisURL, err = requiredValue(getenv("OC_REDIS_URL")); err != nil {
		return Config{}, fmt.Errorf("OC_REDIS_URL: %w", err)
	}
	if cfg.CredentialKeys, err = requiredValue(getenv("OC_CREDENTIAL_KEYS")); err != nil {
		return Config{}, fmt.Errorf("OC_CREDENTIAL_KEYS: %w", err)
	}
	if cfg.ActiveCredentialKey, err = requiredValue(getenv("OC_ACTIVE_CREDENTIAL_KEY")); err != nil {
		return Config{}, fmt.Errorf("OC_ACTIVE_CREDENTIAL_KEY: %w", err)
	}
	if value := getenv("OC_COOKIE_SECURE"); value != "" {
		cfg.CookieSecure, err = strconv.ParseBool(value)
		if err != nil {
			return Config{}, fmt.Errorf("OC_COOKIE_SECURE: %w", err)
		}
	}
	if value := getenv("OC_SESSION_TTL"); value != "" {
		cfg.SessionTTL, err = time.ParseDuration(value)
		if err != nil || cfg.SessionTTL <= 0 {
			return Config{}, fmt.Errorf("OC_SESSION_TTL must be a positive duration")
		}
	}
	cfg.BootstrapAdminUser = getenv("OC_BOOTSTRAP_ADMIN_USER")
	cfg.BootstrapAdminPassword = getenv("OC_BOOTSTRAP_ADMIN_PASSWORD")
	if (cfg.BootstrapAdminUser == "") != (cfg.BootstrapAdminPassword == "") {
		return Config{}, fmt.Errorf("OC_BOOTSTRAP_ADMIN_USER and OC_BOOTSTRAP_ADMIN_PASSWORD must be set together")
	}
	return cfg, nil
}

func requiredValue(value string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("must not be empty")
	}
	return value, nil
}

func stringValue(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func positiveInt(value string, fallback int) (int, error) {
	if value == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("must be a positive integer")
	}
	return n, nil
}

func splitList(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			result = append(result, part)
		}
	}
	return result
}

func parseCIDRs(value string) ([]netip.Prefix, error) {
	parts := splitList(value)
	result := make([]netip.Prefix, 0, len(parts))
	for _, part := range parts {
		prefix, err := netip.ParsePrefix(part)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR %q", part)
		}
		result = append(result, prefix.Masked())
	}
	return result, nil
}

func parsePorts(value string) (map[uint16]struct{}, error) {
	result := make(map[uint16]struct{})
	for _, part := range splitList(value) {
		port, err := strconv.ParseUint(part, 10, 16)
		if err != nil || port == 0 {
			return nil, fmt.Errorf("invalid port %q", part)
		}
		result[uint16(port)] = struct{}{}
	}
	return result, nil
}
