package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
)

type Handle struct {
	Driver Driver
	Config ConnectionInput
	SQL    *sql.DB
	Mongo  *mongo.Client
	Redis  *redis.Client
}

func (h *Handle) Close() error {
	if h == nil {
		return nil
	}
	var err error
	if h.SQL != nil {
		if closeErr := h.SQL.Close(); closeErr != nil {
			err = closeErr
		}
	}
	if h.Mongo != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if disconnectErr := h.Mongo.Disconnect(ctx); disconnectErr != nil && err == nil {
			err = disconnectErr
		}
	}
	if h.Redis != nil {
		if closeErr := h.Redis.Close(); closeErr != nil && err == nil {
			err = closeErr
		}
	}
	return err
}

func (h *Handle) SQLDB() (*sql.DB, error) {
	if h == nil || h.SQL == nil {
		return nil, errors.New("not a SQL connection")
	}
	return h.SQL, nil
}

func (h *Handle) MongoDB() (*mongo.Client, error) {
	if h == nil || h.Mongo == nil {
		return nil, errors.New("not a MongoDB connection")
	}
	return h.Mongo, nil
}

func (h *Handle) RedisClient() (*redis.Client, error) {
	if h == nil || h.Redis == nil {
		return nil, errors.New("not a Redis connection")
	}
	return h.Redis, nil
}

func ConnectionCapabilities(driver Driver) map[string]any {
	switch driver {
	case MongoDB:
		return map[string]any{
			"queryLanguage":        "mongo",
			"documentBrowse":         true,
			"aggregateQuery":         true,
			"indexEdit":              true,
			"schemaEdit":             false,
			"keyBrowse":              false,
			"commandConsole":         false,
			"rowEdit":                true,
			"supportsTransactions":   false,
			"supportsSqlWorkbench":   false,
		}
	case Redis:
		return map[string]any{
			"queryLanguage":        "redis",
			"documentBrowse":         false,
			"aggregateQuery":         false,
			"indexEdit":              false,
			"schemaEdit":             false,
			"keyBrowse":              true,
			"commandConsole":         true,
			"rowEdit":                true,
			"supportsTransactions":   false,
			"supportsSqlWorkbench":   false,
		}
	default:
		return map[string]any{
			"queryLanguage":        "sql",
			"documentBrowse":         false,
			"aggregateQuery":         false,
			"indexEdit":              true,
			"schemaEdit":             true,
			"keyBrowse":              false,
			"commandConsole":         false,
			"rowEdit":                true,
			"supportsTransactions":   true,
			"supportsSqlWorkbench":   true,
		}
	}
}

func DriverLabel(driver Driver) string {
	switch driver {
	case MySQL:
		return "MySQL"
	case PostgreSQL:
		return "PostgreSQL"
	case MongoDB:
		return "MongoDB"
	case Redis:
		return "Redis"
	default:
		return fmt.Sprintf("%q", driver)
	}
}
