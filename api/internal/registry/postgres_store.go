package registry

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"dbworkbench/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PGStore struct {
	pool *pgxpool.Pool
	keys *Keyring
}

func NewPGStore(pool *pgxpool.Pool, keys *Keyring) *PGStore {
	return &PGStore{pool: pool, keys: keys}
}

func (s *PGStore) List(ctx context.Context, p identity.Principal, kind, scope string) ([]Connection, error) {
	systemAdmin := isSystemAdmin(p)
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, kind, driver, scope, owner_user_id, team_id, endpoint, config, octet_length(secret_ciphertext) > 0
		FROM connections
		WHERE (
			(scope = 'personal' AND owner_user_id = $1)
			OR
			(scope = 'team' AND ($4 OR EXISTS (
				SELECT 1 FROM team_members
				WHERE team_members.team_id = connections.team_id
				  AND team_members.user_id = $1
			)))
		)
		  AND ($2 = '' OR kind = $2)
		  AND ($3 = '' OR scope = $3)
		ORDER BY lower(name), id`, p.User.ID, kind, scope, systemAdmin)
	if err != nil {
		return nil, fmt.Errorf("list connections: %w", err)
	}
	defer rows.Close()
	var result []Connection
	for rows.Next() {
		connection, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, connection)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list connections: %w", err)
	}
	return result, nil
}

func (s *PGStore) Create(ctx context.Context, p identity.Principal, input SaveInput) (Connection, error) {
	if input.Secret == nil || input.Secret.empty() {
		return Connection{}, fmt.Errorf("secret is required")
	}
	connection := normalizeConnectionForCreate(p, input.Connection)
	if connection.ID == "" {
		id, err := newConnectionID()
		if err != nil {
			return Connection{}, err
		}
		connection.ID = id
	}
	if err := authorizeCreate(p, connection); err != nil {
		return Connection{}, err
	}
	sealed, err := s.keys.Seal(connection.ID, *input.Secret)
	if err != nil {
		return Connection{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Connection{}, fmt.Errorf("begin create connection: %w", err)
	}
	defer tx.Rollback(ctx)
	created, err := scanConnection(tx.QueryRow(ctx, `
		INSERT INTO connections (
			id, name, kind, driver, scope, owner_user_id, team_id, endpoint, config,
			secret_key_id, secret_ciphertext, created_by, updated_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
		RETURNING id, name, kind, driver, scope, owner_user_id, team_id, endpoint, config, octet_length(secret_ciphertext) > 0`,
		connection.ID, connection.Name, connection.Kind, connection.Driver, connection.Scope, nullString(connection.OwnerUserID),
		nullString(connection.TeamID), normalizeJSON(connection.Endpoint), normalizeJSON(connection.Config),
		sealed.KeyID, sealed.Ciphertext, p.User.ID))
	if err != nil {
		return Connection{}, fmt.Errorf("create connection: %w", err)
	}
	if err := insertAudit(ctx, tx, p.User.ID, "connection.create", created, "success"); err != nil {
		return Connection{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Connection{}, fmt.Errorf("commit create connection: %w", err)
	}
	return created, nil
}

func (s *PGStore) Update(ctx context.Context, p identity.Principal, id string, input SaveInput) (Connection, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Connection{}, fmt.Errorf("begin update connection: %w", err)
	}
	defer tx.Rollback(ctx)

	current, keyID, ciphertext, err := loadConnectionForUpdate(ctx, tx, id)
	if err != nil {
		return Connection{}, err
	}
	if err := authorizeMutation(p, current); err != nil {
		return Connection{}, err
	}
	if input.Secret != nil {
		sealed, err := s.keys.Seal(id, *input.Secret)
		if err != nil {
			return Connection{}, err
		}
		keyID = sealed.KeyID
		ciphertext = sealed.Ciphertext
	}
	next := normalizeConnectionForUpdate(input.Connection, current)
	updated, err := scanConnection(tx.QueryRow(ctx, `
		UPDATE connections
		SET name = $2,
		    kind = $3,
		    driver = $4,
		    endpoint = $5,
		    config = $6,
		    secret_key_id = $7,
		    secret_ciphertext = $8,
		    updated_by = $9,
		    updated_at = now()
		WHERE id = $1
		RETURNING id, name, kind, driver, scope, owner_user_id, team_id, endpoint, config, octet_length(secret_ciphertext) > 0`,
		id, next.Name, next.Kind, next.Driver, normalizeJSON(next.Endpoint), normalizeJSON(next.Config), keyID, ciphertext, p.User.ID))
	if err != nil {
		return Connection{}, fmt.Errorf("update connection: %w", err)
	}
	if err := insertAudit(ctx, tx, p.User.ID, "connection.update", updated, "success"); err != nil {
		return Connection{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Connection{}, fmt.Errorf("commit update connection: %w", err)
	}
	return updated, nil
}

func (s *PGStore) Delete(ctx context.Context, p identity.Principal, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete connection: %w", err)
	}
	defer tx.Rollback(ctx)

	current, _, _, err := loadConnectionForUpdate(ctx, tx, id)
	if err != nil {
		return err
	}
	if err := authorizeMutation(p, current); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM connections WHERE id = $1", id); err != nil {
		return fmt.Errorf("delete connection: %w", err)
	}
	if err := insertAudit(ctx, tx, p.User.ID, "connection.delete", current, "success"); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit delete connection: %w", err)
	}
	return nil
}

func (s *PGStore) SecretForUse(ctx context.Context, p identity.Principal, id string) (Connection, Secret, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Connection{}, Secret{}, fmt.Errorf("begin secret use: %w", err)
	}
	defer tx.Rollback(ctx)

	connection, keyID, ciphertext, err := loadConnectionForUse(ctx, tx, id)
	if err != nil {
		return Connection{}, Secret{}, err
	}
	if err := authorizeUse(p, connection); err != nil {
		return Connection{}, Secret{}, err
	}
	secret, err := s.keys.Open(connection.ID, keyID, ciphertext)
	if err != nil {
		return Connection{}, Secret{}, err
	}
	if err := insertAudit(ctx, tx, p.User.ID, "connection.secret_use", connection, "success"); err != nil {
		return Connection{}, Secret{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Connection{}, Secret{}, fmt.Errorf("commit secret use: %w", err)
	}
	return connection, secret, nil
}

func loadConnectionForUpdate(ctx context.Context, tx pgx.Tx, id string) (Connection, string, []byte, error) {
	return loadConnectionWithSecret(ctx, tx, `
		SELECT id, name, kind, driver, scope, owner_user_id, team_id, endpoint, config, octet_length(secret_ciphertext) > 0,
		       secret_key_id, secret_ciphertext
		FROM connections
		WHERE id = $1
		FOR UPDATE`, id)
}

func loadConnectionForUse(ctx context.Context, tx pgx.Tx, id string) (Connection, string, []byte, error) {
	return loadConnectionWithSecret(ctx, tx, `
		SELECT id, name, kind, driver, scope, owner_user_id, team_id, endpoint, config, octet_length(secret_ciphertext) > 0,
		       secret_key_id, secret_ciphertext
		FROM connections
		WHERE id = $1`, id)
}

func loadConnectionWithSecret(ctx context.Context, tx pgx.Tx, query, id string) (Connection, string, []byte, error) {
	var keyID string
	var ciphertext []byte
	connection, err := scanConnectionWithExtra(tx.QueryRow(ctx, query, id), &keyID, &ciphertext)
	if errors.Is(err, pgx.ErrNoRows) {
		return Connection{}, "", nil, ErrNotFound
	}
	if err != nil {
		return Connection{}, "", nil, err
	}
	return connection, keyID, ciphertext, nil
}

func scanConnection(row pgx.Row) (Connection, error) {
	return scanConnectionWithExtra(row)
}

func scanConnectionWithExtra(row pgx.Row, extra ...any) (Connection, error) {
	var connection Connection
	var ownerUserID sql.NullString
	var teamID sql.NullString
	var endpoint []byte
	var config []byte
	destinations := []any{
		&connection.ID,
		&connection.Name,
		&connection.Kind,
		&connection.Driver,
		&connection.Scope,
		&ownerUserID,
		&teamID,
		&endpoint,
		&config,
		&connection.HasSecret,
	}
	destinations = append(destinations, extra...)
	if err := row.Scan(destinations...); err != nil {
		return Connection{}, err
	}
	if ownerUserID.Valid {
		connection.OwnerUserID = ownerUserID.String
	}
	if teamID.Valid {
		connection.TeamID = teamID.String
	}
	connection.Endpoint = append(json.RawMessage(nil), endpoint...)
	connection.Config = append(json.RawMessage(nil), config...)
	return connection, nil
}

func normalizeConnectionForCreate(p identity.Principal, connection Connection) Connection {
	connection.ID = strings.TrimSpace(connection.ID)
	connection.Name = strings.TrimSpace(connection.Name)
	connection.Kind = strings.TrimSpace(connection.Kind)
	connection.Driver = strings.TrimSpace(connection.Driver)
	connection.Scope = strings.TrimSpace(connection.Scope)
	connection.OwnerUserID = ""
	connection.TeamID = strings.TrimSpace(connection.TeamID)
	if connection.Scope == "personal" {
		connection.OwnerUserID = p.User.ID
		connection.TeamID = ""
	}
	return connection
}

func normalizeConnectionForUpdate(input, current Connection) Connection {
	next := current
	if strings.TrimSpace(input.Name) != "" {
		next.Name = strings.TrimSpace(input.Name)
	}
	if strings.TrimSpace(input.Kind) != "" {
		next.Kind = strings.TrimSpace(input.Kind)
	}
	if strings.TrimSpace(input.Driver) != "" {
		next.Driver = strings.TrimSpace(input.Driver)
	}
	if len(input.Endpoint) > 0 {
		next.Endpoint = input.Endpoint
	}
	if len(input.Config) > 0 {
		next.Config = input.Config
	}
	return next
}

func authorizeCreate(p identity.Principal, connection Connection) error {
	switch connection.Scope {
	case "personal":
		if p.User.ID == "" || p.User.Disabled {
			return ErrForbidden
		}
		return nil
	case "team":
		if p.User.Disabled || (!isSystemAdmin(p) && p.Teams[connection.TeamID] != "admin") {
			return ErrForbidden
		}
		return nil
	default:
		return fmt.Errorf("invalid connection scope")
	}
}

func authorizeMutation(p identity.Principal, connection Connection) error {
	switch connection.Scope {
	case "personal":
		if connection.OwnerUserID == p.User.ID && !p.User.Disabled {
			return nil
		}
		return ErrNotFound
	case "team":
		if !p.User.Disabled && (isSystemAdmin(p) || p.Teams[connection.TeamID] == "admin") {
			return nil
		}
		return ErrForbidden
	default:
		return ErrForbidden
	}
}

func authorizeUse(p identity.Principal, connection Connection) error {
	switch connection.Scope {
	case "personal":
		if connection.OwnerUserID == p.User.ID && !p.User.Disabled {
			return nil
		}
		return ErrNotFound
	case "team":
		if !p.User.Disabled && (isSystemAdmin(p) || p.Teams[connection.TeamID] != "") {
			return nil
		}
		return ErrForbidden
	default:
		return ErrForbidden
	}
}

func isSystemAdmin(p identity.Principal) bool {
	return !p.User.Disabled && p.User.SystemRole == "admin"
}

func insertAudit(ctx context.Context, tx pgx.Tx, actorUserID, action string, connection Connection, outcome string) error {
	metadata, err := json.Marshal(map[string]string{
		"kind":    connection.Kind,
		"driver":  connection.Driver,
		"scope":   connection.Scope,
		"outcome": outcome,
	})
	if err != nil {
		return fmt.Errorf("marshal audit metadata: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, metadata)
		VALUES ($1, $2, 'connection', $3, $4)`, actorUserID, action, connection.ID, metadata); err != nil {
		return fmt.Errorf("insert audit event: %w", err)
	}
	return nil
}

func normalizeJSON(value json.RawMessage) []byte {
	if len(strings.TrimSpace(string(value))) == 0 {
		return []byte("{}")
	}
	return []byte(value)
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func newConnectionID() (string, error) {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate connection ID: %w", err)
	}
	return "conn_" + base64.RawURLEncoding.EncodeToString(buffer), nil
}
