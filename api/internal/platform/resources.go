package platform

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Resources struct {
	Postgres *pgxpool.Pool
	Redis    *redis.Client
}

func Open(ctx context.Context, postgresURL, redisURL string) (*Resources, error) {
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	options, err := redis.ParseURL(redisURL)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(options)
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		pool.Close()
		return nil, fmt.Errorf("ping redis: %w", err)
	}

	return &Resources{Postgres: pool, Redis: client}, nil
}

func (r *Resources) Ready(ctx context.Context) bool {
	return r.Postgres.Ping(ctx) == nil && r.Redis.Ping(ctx).Err() == nil
}

func (r *Resources) Close() {
	_ = r.Redis.Close()
	r.Postgres.Close()
}
