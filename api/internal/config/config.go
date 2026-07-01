package config

import (
	"fmt"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address         string
	QueryTimeout    time.Duration
	PageSize        int
	MaxRows         int
	AllowedCIDRs    []netip.Prefix
	AllowedPorts    map[uint16]struct{}
	AllowedSuffixes []string
	RegistryPath    string
	RegistrySecret  string
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Address:      stringValue(getenv("DBW_ADDRESS"), ":8080"),
		QueryTimeout: 30 * time.Second,
		PageSize:     200,
		MaxRows:      10_000,
		AllowedPorts: map[uint16]struct{}{3306: {}, 5432: {}},
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
	cfg.RegistryPath = stringValue(getenv("DBW_REGISTRY_PATH"), "/data/registry.db")
	cfg.RegistrySecret = getenv("DBW_REGISTRY_SECRET")
	return cfg, nil
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
