package config

import (
	"fmt"
	"strconv"
	"time"
)

type Config struct {
	Address      string
	QueryTimeout time.Duration
	PageSize     int
	MaxRows      int
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Address:      stringValue(getenv("DBW_ADDRESS"), ":8080"),
		QueryTimeout: 30 * time.Second,
		PageSize:     200,
		MaxRows:      10_000,
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
