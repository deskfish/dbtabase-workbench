package db

import (
	"context"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"
)

func ListRedisDatabases(ctx context.Context, client *redis.Client) ([]string, error) {
	names := make([]string, 0, 16)
	for i := 0; i < 16; i++ {
		names = append(names, strconv.Itoa(i))
	}
	return names, nil
}

func RedisDBSize(ctx context.Context, client *redis.Client) (int64, error) {
	size, err := client.DBSize(ctx).Result()
	if err != nil {
		return 0, fmt.Errorf("redis dbsize: %w", err)
	}
	return size, nil
}

func SwitchRedisDatabase(ctx context.Context, input ConnectionInput, dbIndex string) (*Handle, error) {
	config := input
	config.Database = dbIndex
	return openRedis(ctx, config)
}
