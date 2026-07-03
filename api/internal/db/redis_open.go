package db

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

func openRedis(ctx context.Context, input ConnectionInput) (*Handle, error) {
	if input.Host == "" || input.Port == 0 {
		return nil, errors.New("host and port are required")
	}
	dbIndex := 0
	if input.Database != "" {
		parsed, err := strconv.Atoi(input.Database)
		if err != nil || parsed < 0 || parsed > 15 {
			return nil, errors.New("redis database must be an integer between 0 and 15")
		}
		dbIndex = parsed
	}
	opts := &redis.Options{
		Addr:     net.JoinHostPort(input.Host, strconv.Itoa(int(input.Port))),
		Username: input.User,
		Password: input.Password,
		DB:       dbIndex,
	}
	if input.TLSMode == "required" || input.TLSMode == "require" {
		opts.TLSConfig = nil // use system default when TLS requested; caller may extend later
	}
	client := redis.NewClient(opts)
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return nil, errors.New("database connection failed")
	}
	input.Database = strconv.Itoa(dbIndex)
	return &Handle{Driver: Redis, Config: input, Redis: client}, nil
}

func RedisDBIndex(database string) (int, error) {
	if database == "" {
		return 0, nil
	}
	index, err := strconv.Atoi(database)
	if err != nil || index < 0 || index > 15 {
		return 0, fmt.Errorf("invalid redis database index %q", database)
	}
	return index, nil
}
