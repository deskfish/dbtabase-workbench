package registry

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("connection not found")

// ConnectionRecord 连接配置记录
type ConnectionRecord struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Driver          string `json:"driver"`
	Host            string `json:"host"`
	Port            uint16 `json:"port"`
	Database        string `json:"database"`
	User            string `json:"user"`
	Password        string `json:"password,omitempty"`
	TLSMode         string `json:"tlsMode"`
	LastConnectedAt *int64 `json:"lastConnectedAt,omitempty"`
	SourceTeamID    string `json:"sourceTeamId,omitempty"`
	SharedBy        string `json:"sharedBy,omitempty"`
	SharedAt        *int64 `json:"sharedAt,omitempty"`
}

type Store struct {
	db     *sql.DB
	secret string
}

func Open(path, secret string) (*Store, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, fmt.Errorf("registry secret is required")
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	store := &Store{db: db, secret: secret}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS user_profiles (
  nickname TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_connections (
  id TEXT PRIMARY KEY,
  owner_nickname TEXT NOT NULL,
  name TEXT NOT NULL,
  driver TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT NOT NULL,
  user_name TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  tls_mode TEXT NOT NULL,
  source_team_id TEXT,
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_owner ON personal_connections(owner_nickname);
CREATE TABLE IF NOT EXISTS team_connections (
  id TEXT PRIMARY KEY,
  shared_by_nickname TEXT NOT NULL,
  name TEXT NOT NULL,
  driver TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT NOT NULL,
  user_name TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  tls_mode TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`)
	return err
}

func (s *Store) ensureProfile(ctx context.Context, nickname string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `
INSERT INTO user_profiles(nickname, created_at) VALUES(?, ?)
ON CONFLICT(nickname) DO NOTHING
`, nickname, now)
	return err
}

func normalizeNickname(value string) (string, error) {
	nickname := strings.TrimSpace(value)
	if nickname == "" {
		return "", fmt.Errorf("nickname is required")
	}
	if len([]rune(nickname)) > 32 {
		return "", fmt.Errorf("nickname too long")
	}
	return nickname, nil
}

func (s *Store) ListPersonal(ctx context.Context, nickname string) ([]ConnectionRecord, error) {
	owner, err := normalizeNickname(nickname)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
SELECT id, name, driver, host, port, database_name, user_name, password_enc, tls_mode, source_team_id, last_connected_at
FROM personal_connections
WHERE owner_nickname = ?
ORDER BY COALESCE(last_connected_at, 0) DESC, name ASC
`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPersonalRows(rows, s.secret)
}

func (s *Store) UpsertPersonal(ctx context.Context, nickname string, record ConnectionRecord) (ConnectionRecord, error) {
	owner, err := normalizeNickname(nickname)
	if err != nil {
		return ConnectionRecord{}, err
	}
	if err := s.ensureProfile(ctx, owner); err != nil {
		return ConnectionRecord{}, err
	}
	if strings.TrimSpace(record.ID) == "" || strings.TrimSpace(record.Name) == "" {
		return ConnectionRecord{}, fmt.Errorf("id and name are required")
	}
	enc, err := encryptSecret(s.secret, record.Password)
	if err != nil {
		return ConnectionRecord{}, err
	}
	now := time.Now().UnixMilli()
	_, err = s.db.ExecContext(ctx, `
INSERT INTO personal_connections(
  id, owner_nickname, name, driver, host, port, database_name, user_name, password_enc, tls_mode,
  source_team_id, last_connected_at, created_at, updated_at
) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  owner_nickname = excluded.owner_nickname,
  name = excluded.name,
  driver = excluded.driver,
  host = excluded.host,
  port = excluded.port,
  database_name = excluded.database_name,
  user_name = excluded.user_name,
  password_enc = excluded.password_enc,
  tls_mode = excluded.tls_mode,
  source_team_id = excluded.source_team_id,
  last_connected_at = excluded.last_connected_at,
  updated_at = excluded.updated_at
`, record.ID, owner, record.Name, record.Driver, record.Host, record.Port, record.Database, record.User, enc, record.TLSMode, nullIfEmpty(record.SourceTeamID), record.LastConnectedAt, now, now)
	if err != nil {
		return ConnectionRecord{}, err
	}
	return s.GetPersonal(ctx, owner, record.ID)
}

func (s *Store) GetPersonal(ctx context.Context, nickname, id string) (ConnectionRecord, error) {
	owner, err := normalizeNickname(nickname)
	if err != nil {
		return ConnectionRecord{}, err
	}
	row := s.db.QueryRowContext(ctx, `
SELECT id, name, driver, host, port, database_name, user_name, password_enc, tls_mode, source_team_id, last_connected_at
FROM personal_connections
WHERE owner_nickname = ? AND id = ?
`, owner, id)
	return scanPersonalRow(row, s.secret)
}

func (s *Store) DeletePersonal(ctx context.Context, nickname, id string) error {
	owner, err := normalizeNickname(nickname)
	if err != nil {
		return err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM personal_connections WHERE owner_nickname = ? AND id = ?`, owner, id)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) MigratePersonal(ctx context.Context, nickname string, records []ConnectionRecord) ([]ConnectionRecord, error) {
	for _, record := range records {
		if _, err := s.UpsertPersonal(ctx, nickname, record); err != nil {
			return nil, err
		}
	}
	return s.ListPersonal(ctx, nickname)
}

func (s *Store) ListTeam(ctx context.Context) ([]ConnectionRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, shared_by_nickname, name, driver, host, port, database_name, user_name, password_enc, tls_mode, created_at
FROM team_connections
ORDER BY created_at DESC, name ASC
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTeamRows(rows, s.secret)
}

func (s *Store) SharePersonalToTeam(ctx context.Context, nickname, personalID string) (ConnectionRecord, error) {
	owner, err := normalizeNickname(nickname)
	if err != nil {
		return ConnectionRecord{}, err
	}
	personal, err := s.GetPersonal(ctx, owner, personalID)
	if err != nil {
		return ConnectionRecord{}, err
	}
	enc, err := encryptSecret(s.secret, personal.Password)
	if err != nil {
		return ConnectionRecord{}, err
	}
	now := time.Now().UnixMilli()
	teamID := personalID
	_, err = s.db.ExecContext(ctx, `
INSERT INTO team_connections(
  id, shared_by_nickname, name, driver, host, port, database_name, user_name, password_enc, tls_mode, created_at, updated_at
) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  shared_by_nickname = excluded.shared_by_nickname,
  name = excluded.name,
  driver = excluded.driver,
  host = excluded.host,
  port = excluded.port,
  database_name = excluded.database_name,
  user_name = excluded.user_name,
  password_enc = excluded.password_enc,
  tls_mode = excluded.tls_mode,
  updated_at = excluded.updated_at
`, teamID, owner, personal.Name, personal.Driver, personal.Host, personal.Port, personal.Database, personal.User, enc, personal.TLSMode, now, now)
	if err != nil {
		return ConnectionRecord{}, err
	}
	return s.GetTeam(ctx, teamID)
}

func (s *Store) GetTeam(ctx context.Context, id string) (ConnectionRecord, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT id, shared_by_nickname, name, driver, host, port, database_name, user_name, password_enc, tls_mode, created_at
FROM team_connections WHERE id = ?
`, id)
	return scanTeamRow(row, s.secret)
}

func (s *Store) ImportTeamToPersonal(ctx context.Context, nickname, teamID string) (ConnectionRecord, error) {
	owner, err := normalizeNickname(nickname)
	if err != nil {
		return ConnectionRecord{}, err
	}
	team, err := s.GetTeam(ctx, teamID)
	if err != nil {
		return ConnectionRecord{}, err
	}
	personalID := fmt.Sprintf("import:%s:%s:%d", owner, teamID, time.Now().UnixMilli())
	record := ConnectionRecord{
		ID:           personalID,
		Name:         team.Name,
		Driver:       team.Driver,
		Host:         team.Host,
		Port:         team.Port,
		Database:     team.Database,
		User:         team.User,
		Password:     team.Password,
		TLSMode:      team.TLSMode,
		SourceTeamID: teamID,
	}
	return s.UpsertPersonal(ctx, owner, record)
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func scanPersonalRow(row *sql.Row, secret string) (ConnectionRecord, error) {
	var record ConnectionRecord
	var enc string
	var sourceTeam sql.NullString
	var lastConnected sql.NullInt64
	if err := row.Scan(&record.ID, &record.Name, &record.Driver, &record.Host, &record.Port, &record.Database, &record.User, &enc, &record.TLSMode, &sourceTeam, &lastConnected); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ConnectionRecord{}, ErrNotFound
		}
		return ConnectionRecord{}, err
	}
	password, err := decryptSecret(secret, enc)
	if err != nil {
		return ConnectionRecord{}, err
	}
	record.Password = password
	if sourceTeam.Valid {
		record.SourceTeamID = sourceTeam.String
	}
	if lastConnected.Valid {
		value := lastConnected.Int64
		record.LastConnectedAt = &value
	}
	return record, nil
}

func scanPersonalRows(rows *sql.Rows, secret string) ([]ConnectionRecord, error) {
	result := make([]ConnectionRecord, 0)
	for rows.Next() {
		var record ConnectionRecord
		var enc string
		var sourceTeam sql.NullString
		var lastConnected sql.NullInt64
		if err := rows.Scan(&record.ID, &record.Name, &record.Driver, &record.Host, &record.Port, &record.Database, &record.User, &enc, &record.TLSMode, &sourceTeam, &lastConnected); err != nil {
			return nil, err
		}
		password, err := decryptSecret(secret, enc)
		if err != nil {
			return nil, err
		}
		record.Password = password
		if sourceTeam.Valid {
			record.SourceTeamID = sourceTeam.String
		}
		if lastConnected.Valid {
			value := lastConnected.Int64
			record.LastConnectedAt = &value
		}
		result = append(result, record)
	}
	return result, rows.Err()
}

func scanTeamRow(row *sql.Row, secret string) (ConnectionRecord, error) {
	var record ConnectionRecord
	var enc string
	var sharedAt int64
	if err := row.Scan(&record.ID, &record.SharedBy, &record.Name, &record.Driver, &record.Host, &record.Port, &record.Database, &record.User, &enc, &record.TLSMode, &sharedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ConnectionRecord{}, ErrNotFound
		}
		return ConnectionRecord{}, err
	}
	password, err := decryptSecret(secret, enc)
	if err != nil {
		return ConnectionRecord{}, err
	}
	record.Password = password
	record.SharedAt = &sharedAt
	return record, nil
}

func scanTeamRows(rows *sql.Rows, secret string) ([]ConnectionRecord, error) {
	result := make([]ConnectionRecord, 0)
	for rows.Next() {
		var record ConnectionRecord
		var enc string
		var sharedAt int64
		if err := rows.Scan(&record.ID, &record.SharedBy, &record.Name, &record.Driver, &record.Host, &record.Port, &record.Database, &record.User, &enc, &record.TLSMode, &sharedAt); err != nil {
			return nil, err
		}
		password, err := decryptSecret(secret, enc)
		if err != nil {
			return nil, err
		}
		record.Password = password
		record.SharedAt = &sharedAt
		result = append(result, record)
	}
	return result, rows.Err()
}
