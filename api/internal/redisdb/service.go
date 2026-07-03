package redisdb

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const MaxScanCount = 500
const MaxCommandLines = 50

var blockedCommands = map[string]struct{}{
	"FLUSHALL": {}, "FLUSHDB": {}, "CONFIG": {}, "DEBUG": {}, "SHUTDOWN": {}, "SLAVEOF": {}, "REPLICAOF": {},
}

type KeySummary struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	TTL  int64  `json:"ttl"`
}

type KeysResult struct {
	Keys       []KeySummary `json:"keys"`
	Cursor     uint64       `json:"cursor"`
	DurationMs int64        `json:"durationMs"`
}

type KeyDetail struct {
	Key        string `json:"key"`
	Type       string `json:"type"`
	TTL        int64  `json:"ttl"`
	Size       int64  `json:"size,omitempty"`
	Encoding   string `json:"encoding,omitempty"`
	Value      any    `json:"value"`
	DurationMs int64  `json:"durationMs"`
}

type CommandRequest struct {
	Commands []string `json:"commands"`
}

type CommandResult struct {
	Results    []CommandOutput `json:"results"`
	DurationMs int64           `json:"durationMs"`
}

type CommandOutput struct {
	Command string `json:"command"`
	Output  any    `json:"output"`
	Error   string `json:"error,omitempty"`
}

type KeyUpdate struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
	TTL   *int64 `json:"ttl,omitempty"`
}

func ScanKeys(ctx context.Context, client *redis.Client, match string, cursor uint64, count int) (KeysResult, error) {
	start := time.Now()
	if count <= 0 || count > MaxScanCount {
		count = 200
	}
	if match == "" {
		match = "*"
	}
	keys, next, err := client.Scan(ctx, cursor, match, int64(count)).Result()
	if err != nil {
		return KeysResult{}, fmt.Errorf("redis scan: %w", err)
	}
	summaries := make([]KeySummary, 0, len(keys))
	for _, key := range keys {
		keyType, err := client.Type(ctx, key).Result()
		if err != nil {
			keyType = "unknown"
		}
		ttl, _ := client.TTL(ctx, key).Result()
		summaries = append(summaries, KeySummary{Key: key, Type: keyType, TTL: int64(ttl.Seconds())})
	}
	return KeysResult{Keys: summaries, Cursor: next, DurationMs: time.Since(start).Milliseconds()}, nil
}

func GetKey(ctx context.Context, client *redis.Client, key string) (KeyDetail, error) {
	start := time.Now()
	if key == "" {
		return KeyDetail{}, errors.New("key is required")
	}
	exists, err := client.Exists(ctx, key).Result()
	if err != nil {
		return KeyDetail{}, err
	}
	if exists == 0 {
		return KeyDetail{}, fmt.Errorf("key %q not found", key)
	}
	keyType, err := client.Type(ctx, key).Result()
	if err != nil {
		return KeyDetail{}, err
	}
	ttl, _ := client.TTL(ctx, key).Result()
	value, err := readValue(ctx, client, key, keyType)
	if err != nil {
		return KeyDetail{}, err
	}
	return KeyDetail{
		Key: key, Type: keyType, TTL: int64(ttl.Seconds()), Value: value,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

func SaveKey(ctx context.Context, client *redis.Client, key string, update KeyUpdate) error {
	if key == "" {
		return errors.New("key is required")
	}
	switch strings.ToLower(update.Type) {
	case "string":
		text, ok := update.Value.(string)
		if !ok {
			return errors.New("string value required")
		}
		if err := client.Set(ctx, key, text, 0).Err(); err != nil {
			return err
		}
	case "hash":
		fields, ok := update.Value.(map[string]any)
		if !ok {
			return errors.New("hash value must be an object")
		}
		pipe := client.TxPipeline()
		pipe.Del(ctx, key)
		stringFields := make(map[string]string, len(fields))
		for k, v := range fields {
			stringFields[k] = fmt.Sprint(v)
		}
		pipe.HSet(ctx, key, stringFields)
		if _, err := pipe.Exec(ctx); err != nil {
			return err
		}
	case "list":
		items, ok := update.Value.([]any)
		if !ok {
			return errors.New("list value must be an array")
		}
		pipe := client.TxPipeline()
		pipe.Del(ctx, key)
		values := make([]any, len(items))
		for i, item := range items {
			values[i] = fmt.Sprint(item)
		}
		if len(values) > 0 {
			pipe.RPush(ctx, key, values...)
		}
		if _, err := pipe.Exec(ctx); err != nil {
			return err
		}
	case "set":
		items, ok := update.Value.([]any)
		if !ok {
			return errors.New("set value must be an array")
		}
		pipe := client.TxPipeline()
		pipe.Del(ctx, key)
		members := make([]any, len(items))
		for i, item := range items {
			members[i] = fmt.Sprint(item)
		}
		if len(members) > 0 {
			pipe.SAdd(ctx, key, members...)
		}
		if _, err := pipe.Exec(ctx); err != nil {
			return err
		}
	case "zset":
		items, ok := update.Value.([]map[string]any)
		if !ok {
			return errors.New("zset value must be an array of {member, score}")
		}
		pipe := client.TxPipeline()
		pipe.Del(ctx, key)
		for _, item := range items {
			member := fmt.Sprint(item["member"])
			score, _ := strconv.ParseFloat(fmt.Sprint(item["score"]), 64)
			pipe.ZAdd(ctx, key, redis.Z{Score: score, Member: member})
		}
		if _, err := pipe.Exec(ctx); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported redis type %q", update.Type)
	}
	if update.TTL != nil {
		return client.Expire(ctx, key, time.Duration(*update.TTL)*time.Second).Err()
	}
	return nil
}

func DeleteKey(ctx context.Context, client *redis.Client, key string) error {
	result, err := client.Del(ctx, key).Result()
	if err != nil {
		return err
	}
	if result != 1 {
		return fmt.Errorf("delete removed %d keys, expected 1", result)
	}
	return nil
}

func SetTTL(ctx context.Context, client *redis.Client, key string, ttlSeconds int64) error {
	if ttlSeconds <= 0 {
		return client.Persist(ctx, key).Err()
	}
	return client.Expire(ctx, key, time.Duration(ttlSeconds)*time.Second).Err()
}

func ExecuteCommands(ctx context.Context, client *redis.Client, commands []string) (CommandResult, error) {
	start := time.Now()
	if len(commands) == 0 {
		return CommandResult{}, errors.New("commands are required")
	}
	if len(commands) > MaxCommandLines {
		return CommandResult{}, fmt.Errorf("too many commands, max %d", MaxCommandLines)
	}
	outputs := make([]CommandOutput, 0, len(commands))
	for _, line := range commands {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := splitCommand(line)
		if len(parts) == 0 {
			continue
		}
		cmd := strings.ToUpper(parts[0])
		if _, blocked := blockedCommands[cmd]; blocked {
			outputs = append(outputs, CommandOutput{Command: line, Error: "command blocked for safety"})
			continue
		}
		args := make([]any, len(parts)-1)
		for i, arg := range parts[1:] {
			args[i] = arg
		}
		value, err := client.Do(ctx, append([]any{parts[0]}, args...)...).Result()
		if err != nil {
			outputs = append(outputs, CommandOutput{Command: line, Error: err.Error()})
			continue
		}
		outputs = append(outputs, CommandOutput{Command: line, Output: normalizeReply(value)})
	}
	return CommandResult{Results: outputs, DurationMs: time.Since(start).Milliseconds()}, nil
}

func readValue(ctx context.Context, client *redis.Client, key, keyType string) (any, error) {
	switch keyType {
	case "string":
		return client.Get(ctx, key).Result()
	case "hash":
		return client.HGetAll(ctx, key).Result()
	case "list":
		return client.LRange(ctx, key, 0, -1).Result()
	case "set":
		return client.SMembers(ctx, key).Result()
	case "zset":
		values, err := client.ZRangeWithScores(ctx, key, 0, -1).Result()
		if err != nil {
			return nil, err
		}
		items := make([]map[string]any, 0, len(values))
		for _, item := range values {
			items = append(items, map[string]any{"member": item.Member, "score": item.Score})
		}
		return items, nil
	default:
		return client.Get(ctx, key).Result()
	}
}

func splitCommand(line string) []string {
	var parts []string
	var current strings.Builder
	inQuotes := false
	for _, r := range line {
		switch {
		case r == '"':
			inQuotes = !inQuotes
		case (r == ' ' || r == '\t') && !inQuotes:
			if current.Len() > 0 {
				parts = append(parts, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(r)
		}
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}

func normalizeReply(value any) any {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = normalizeReply(item)
		}
		return out
	default:
		return typed
	}
}
