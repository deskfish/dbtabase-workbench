package identity

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type LoginSession struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	CSRFToken string    `json:"csrfToken"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type Sessions struct {
	redis redis.Cmdable
	ttl   time.Duration
	now   func() time.Time
}

var ErrSessionNotFound = errors.New("session not found")

func NewSessions(client redis.Cmdable, ttl time.Duration) *Sessions {
	return &Sessions{redis: client, ttl: ttl, now: time.Now}
}

func (s *Sessions) Create(ctx context.Context, userID string) (LoginSession, error) {
	if s.ttl <= 0 {
		return LoginSession{}, fmt.Errorf("session ttl must be positive")
	}
	for {
		id, err := randomSessionToken()
		if err != nil {
			return LoginSession{}, err
		}
		csrf, err := randomSessionToken()
		if err != nil {
			return LoginSession{}, err
		}
		session := LoginSession{
			ID:        id,
			UserID:    userID,
			CSRFToken: csrf,
			ExpiresAt: s.now().Add(s.ttl).UTC(),
		}
		payload, err := json.Marshal(session)
		if err != nil {
			return LoginSession{}, fmt.Errorf("marshal session: %w", err)
		}
		created, err := s.redis.SetNX(ctx, sessionKey(id), payload, s.ttl).Result()
		if err != nil {
			return LoginSession{}, fmt.Errorf("create session: %w", err)
		}
		if !created {
			continue
		}
		userKey := userSessionsKey(userID)
		if err := s.redis.SAdd(ctx, userKey, id).Err(); err != nil {
			_ = s.redis.Del(ctx, sessionKey(id)).Err()
			return LoginSession{}, fmt.Errorf("index user session: %w", err)
		}
		if err := s.redis.Expire(ctx, userKey, s.ttl).Err(); err != nil {
			_ = s.redis.Del(ctx, sessionKey(id)).Err()
			_ = s.redis.SRem(ctx, userKey, id).Err()
			return LoginSession{}, fmt.Errorf("expire user sessions: %w", err)
		}
		return session, nil
	}
}

func (s *Sessions) Get(ctx context.Context, id string) (LoginSession, error) {
	payload, err := s.redis.Get(ctx, sessionKey(id)).Bytes()
	if errors.Is(err, redis.Nil) {
		return LoginSession{}, ErrSessionNotFound
	}
	if err != nil {
		return LoginSession{}, fmt.Errorf("load session: %w", err)
	}
	var session LoginSession
	if err := json.Unmarshal(payload, &session); err != nil {
		return LoginSession{}, fmt.Errorf("decode session: %w", err)
	}
	return session, nil
}

func (s *Sessions) Delete(ctx context.Context, id string) error {
	session, err := s.Get(ctx, id)
	if err != nil && !errors.Is(err, ErrSessionNotFound) {
		return err
	}
	if err := s.redis.Del(ctx, sessionKey(id)).Err(); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	if err == nil {
		if err := s.redis.SRem(ctx, userSessionsKey(session.UserID), id).Err(); err != nil {
			return fmt.Errorf("remove user session index: %w", err)
		}
	}
	return nil
}

func (s *Sessions) DeleteUser(ctx context.Context, userID string) error {
	userKey := userSessionsKey(userID)
	ids, err := s.redis.SMembers(ctx, userKey).Result()
	if err != nil {
		return fmt.Errorf("load user sessions: %w", err)
	}
	keys := make([]string, 0, len(ids)+1)
	for _, id := range ids {
		keys = append(keys, sessionKey(id))
	}
	keys = append(keys, userKey)
	if err := s.redis.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("delete user sessions: %w", err)
	}
	return nil
}

func sessionKey(id string) string {
	return "ops:session:" + id
}

func userSessionsKey(userID string) string {
	return "ops:user-sessions:" + userID
}

func randomSessionToken() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}
