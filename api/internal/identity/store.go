package identity

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID          string
	Username    string
	DisplayName string
	SystemRole  string
	Disabled    bool
}

type Team struct {
	ID   string
	Name string
	Role string
}

type Principal struct {
	User  User
	Teams map[string]string
}

type Store struct {
	pool *pgxpool.Pool
}

var (
	ErrAlreadyBootstrapped = errors.New("identity already bootstrapped")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrForbidden           = errors.New("forbidden")
)

const bootstrapLockKey int64 = 0x4f435f4944454e54

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) BootstrapAdmin(ctx context.Context, username, password string) error {
	username = normalizeUsername(username)
	passwordHash, err := HashPassword(password)
	if err != nil {
		return err
	}
	userID, err := newID("usr_")
	if err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin bootstrap: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", bootstrapLockKey); err != nil {
		return fmt.Errorf("lock bootstrap: %w", err)
	}
	var exists bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users)").Scan(&exists); err != nil {
		return fmt.Errorf("check bootstrap state: %w", err)
	}
	if exists {
		return ErrAlreadyBootstrapped
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO users (id, username, display_name, password_hash, system_role)
		VALUES ($1, $2, $2, $3, 'admin')`, userID, username, passwordHash)
	if err != nil {
		return fmt.Errorf("create bootstrap admin: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit bootstrap: %w", err)
	}
	return nil
}

func (s *Store) Authenticate(ctx context.Context, username, password string) (User, error) {
	username = normalizeUsername(username)
	var user User
	var passwordHash string
	err := s.pool.QueryRow(ctx, `
		SELECT id, username, display_name, password_hash, system_role, disabled_at IS NOT NULL
		FROM users
		WHERE username = $1`, username).Scan(
		&user.ID,
		&user.Username,
		&user.DisplayName,
		&passwordHash,
		&user.SystemRole,
		&user.Disabled,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, fmt.Errorf("load user credentials: %w", err)
	}
	if !VerifyPassword(password, passwordHash) || user.Disabled {
		return User{}, ErrInvalidCredentials
	}
	return user, nil
}

func (s *Store) CreateUser(ctx context.Context, actor Principal, username, displayName, password, role string) (User, error) {
	allowed, err := s.isSystemAdmin(ctx, actor.User.ID)
	if err != nil {
		return User{}, err
	}
	if !allowed {
		return User{}, ErrForbidden
	}

	username = normalizeUsername(username)
	displayName = strings.TrimSpace(displayName)
	passwordHash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}
	userID, err := newID("usr_")
	if err != nil {
		return User{}, err
	}

	var user User
	err = s.pool.QueryRow(ctx, `
		INSERT INTO users (id, username, display_name, password_hash, system_role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, display_name, system_role, disabled_at IS NOT NULL`,
		userID, username, displayName, passwordHash, role,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &user.SystemRole, &user.Disabled)
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

func (s *Store) CreateTeam(ctx context.Context, actor Principal, name string) (Team, error) {
	allowed, err := s.isSystemAdmin(ctx, actor.User.ID)
	if err != nil {
		return Team{}, err
	}
	if !allowed {
		return Team{}, ErrForbidden
	}

	teamID, err := newID("team_")
	if err != nil {
		return Team{}, err
	}
	name = strings.TrimSpace(name)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Team{}, fmt.Errorf("begin create team: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "INSERT INTO teams (id, name, created_by) VALUES ($1, $2, $3)", teamID, name, actor.User.ID); err != nil {
		return Team{}, fmt.Errorf("create team: %w", err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')", teamID, actor.User.ID); err != nil {
		return Team{}, fmt.Errorf("add team creator: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Team{}, fmt.Errorf("commit create team: %w", err)
	}
	return Team{ID: teamID, Name: name, Role: "admin"}, nil
}

func (s *Store) AddTeamMember(ctx context.Context, actor Principal, teamID, userID, role string) error {
	result, err := s.pool.Exec(ctx, `
		WITH authorized AS (
			SELECT 1
			FROM users
			WHERE id = $1 AND disabled_at IS NULL AND system_role = 'admin'
			UNION ALL
			SELECT 1
			FROM users
			JOIN team_members ON team_members.user_id = users.id
			WHERE users.id = $1
			  AND users.disabled_at IS NULL
			  AND team_members.team_id = $2
			  AND team_members.role = 'admin'
			LIMIT 1
		)
		INSERT INTO team_members (team_id, user_id, role)
		SELECT $2, $3, $4 FROM authorized
		ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		actor.User.ID, teamID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("add team member: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrForbidden
	}
	return nil
}

func (s *Store) PrincipalForUser(ctx context.Context, userID string) (Principal, error) {
	principal := Principal{Teams: make(map[string]string)}
	err := s.pool.QueryRow(ctx, `
		SELECT id, username, display_name, system_role, disabled_at IS NOT NULL
		FROM users
		WHERE id = $1`, userID).Scan(
		&principal.User.ID,
		&principal.User.Username,
		&principal.User.DisplayName,
		&principal.User.SystemRole,
		&principal.User.Disabled,
	)
	if err != nil {
		return Principal{}, fmt.Errorf("load principal user: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT team_id, role
		FROM team_members
		WHERE user_id = $1`, userID)
	if err != nil {
		return Principal{}, fmt.Errorf("load principal teams: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var teamID, role string
		if err := rows.Scan(&teamID, &role); err != nil {
			return Principal{}, fmt.Errorf("scan principal team: %w", err)
		}
		principal.Teams[teamID] = role
	}
	if err := rows.Err(); err != nil {
		return Principal{}, fmt.Errorf("load principal teams: %w", err)
	}
	return principal, nil
}

func (s *Store) isSystemAdmin(ctx context.Context, userID string) (bool, error) {
	var allowed bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM users
			WHERE id = $1 AND disabled_at IS NULL AND system_role = 'admin'
		)`, userID).Scan(&allowed)
	if err != nil {
		return false, fmt.Errorf("authorize system admin: %w", err)
	}
	return allowed, nil
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func newID(prefix string) (string, error) {
	random := make([]byte, 18)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate %s ID: %w", strings.TrimSuffix(prefix, "_"), err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(random), nil
}
