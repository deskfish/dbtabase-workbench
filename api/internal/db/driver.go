package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Driver string

const (
	MySQL      Driver = "mysql"
	PostgreSQL Driver = "postgres"
)

type ConnectionInput struct {
	Driver   Driver `json:"driver"`
	Host     string `json:"host"`
	Port     uint16 `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	Password string `json:"password"`
	TLSMode  string `json:"tlsMode"`
}

func Open(ctx context.Context, input ConnectionInput) (*sql.DB, error) {
	dsn, err := buildDSN(input)
	if err != nil {
		return nil, err
	}
	driverName := string(input.Driver)
	if input.Driver == PostgreSQL {
		driverName = "pgx"
	}
	database, err := sql.Open(driverName, dsn)
	if err != nil {
		return nil, errors.New("database connection could not be initialized")
	}
	database.SetMaxOpenConns(5)
	database.SetMaxIdleConns(2)
	database.SetConnMaxLifetime(30 * time.Minute)
	if err := database.PingContext(ctx); err != nil {
		_ = database.Close()
		return nil, errors.New("database connection failed")
	}
	return database, nil
}

func buildDSN(input ConnectionInput) (string, error) {
	if input.Host == "" || input.Port == 0 || input.User == "" {
		return "", errors.New("host, port, and user are required")
	}
	switch input.Driver {
	case MySQL:
		cfg := mysql.NewConfig()
		cfg.User = input.User
		cfg.Passwd = input.Password
		cfg.Net = "tcp"
		cfg.Addr = net.JoinHostPort(input.Host, strconv.Itoa(int(input.Port)))
		cfg.DBName = input.Database
		cfg.ParseTime = true
		switch input.TLSMode {
		case "", "disabled":
			cfg.TLSConfig = "false"
		case "preferred", "required", "skip-verify":
			cfg.TLSConfig = input.TLSMode
		default:
			return "", errors.New("invalid MySQL TLS mode")
		}
		return cfg.FormatDSN(), nil
	case PostgreSQL:
		sslmode := input.TLSMode
		if sslmode == "" {
			sslmode = "prefer"
		}
		switch sslmode {
		case "disable", "allow", "prefer", "require", "verify-ca", "verify-full":
		default:
			return "", errors.New("invalid PostgreSQL TLS mode")
		}
		connURL := &url.URL{Scheme: "postgres", Host: net.JoinHostPort(input.Host, strconv.Itoa(int(input.Port))), Path: input.Database}
		connURL.User = url.UserPassword(input.User, input.Password)
		query := connURL.Query()
		query.Set("sslmode", sslmode)
		connURL.RawQuery = query.Encode()
		cfg, err := pgx.ParseConfig(connURL.String())
		if err != nil {
			return "", errors.New("invalid PostgreSQL connection configuration")
		}
		return cfg.ConnString(), nil
	default:
		return "", fmt.Errorf("unsupported database driver %q", input.Driver)
	}
}
