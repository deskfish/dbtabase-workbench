package identity

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

type TeamMember struct {
	User User
	Role string
}

type TeamAssignment struct {
	TeamID string
	Role   string
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
	ErrConflict            = errors.New("conflict")
	ErrInvalid             = errors.New("invalid")
	ErrNotFound            = errors.New("not found")
	ErrLastTeamAdmin       = errors.New("last team admin")
	ErrLastSystemAdmin     = errors.New("last system admin")
)

type UserUpdate struct {
	DisplayName *string
	SystemRole  *string
	Disabled    *bool
}

const bootstrapLockKey int64 = 0x4f435f4944454e54

const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
	pgCheckViolation      = "23514"
)

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

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, fmt.Errorf("begin create user: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeSystemAdminForUpdate(ctx, tx, actor.User.ID); err != nil {
		return User{}, err
	}

	var user User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (id, username, display_name, password_hash, system_role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, display_name, system_role, disabled_at IS NOT NULL`,
		userID, username, displayName, passwordHash, role,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &user.SystemRole, &user.Disabled)
	if err != nil {
		return User{}, mapStoreError("create user", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, fmt.Errorf("commit create user: %w", err)
	}
	return user, nil
}

func (s *Store) CreateTeam(ctx context.Context, actor Principal, name string) (Team, error) {
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
	if err := authorizeSystemAdminForUpdate(ctx, tx, actor.User.ID); err != nil {
		return Team{}, err
	}

	if _, err := tx.Exec(ctx, "INSERT INTO teams (id, name, created_by) VALUES ($1, $2, $3)", teamID, name, actor.User.ID); err != nil {
		return Team{}, mapStoreError("create team", err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')", teamID, actor.User.ID); err != nil {
		return Team{}, mapStoreError("add team creator", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Team{}, fmt.Errorf("commit create team: %w", err)
	}
	return Team{ID: teamID, Name: name, Role: "admin"}, nil
}

func (s *Store) UpdateUser(ctx context.Context, actor Principal, userID string, update UserUpdate) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, fmt.Errorf("begin update user: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeSystemAdminForUpdate(ctx, tx, actor.User.ID); err != nil {
		return User{}, err
	}

	var current User
	err = tx.QueryRow(ctx, `
		SELECT id, username, display_name, system_role, disabled_at IS NOT NULL
		FROM users
		WHERE id = $1
		FOR UPDATE`, userID,
	).Scan(&current.ID, &current.Username, &current.DisplayName, &current.SystemRole, &current.Disabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("lock update user: %w", err)
	}

	displayName := current.DisplayName
	if update.DisplayName != nil {
		displayName = strings.TrimSpace(*update.DisplayName)
		if displayName == "" {
			return User{}, ErrInvalid
		}
	}
	role := current.SystemRole
	if update.SystemRole != nil {
		role = strings.TrimSpace(*update.SystemRole)
		if role != "member" && role != "admin" {
			return User{}, ErrInvalid
		}
	}
	disabled := current.Disabled
	if update.Disabled != nil {
		disabled = *update.Disabled
	}
	if userID == actor.User.ID && disabled {
		return User{}, ErrForbidden
	}
	if current.SystemRole == "admin" && (role != "admin" || disabled) {
		if err := ensureAnotherActiveSystemAdmin(ctx, tx, userID); err != nil {
			return User{}, err
		}
	}

	var user User
	if update.Disabled != nil {
		if disabled {
			err = tx.QueryRow(ctx, `
				UPDATE users
				SET display_name = $2, system_role = $3, disabled_at = now(), updated_at = now()
				WHERE id = $1
				RETURNING id, username, display_name, system_role, disabled_at IS NOT NULL`,
				userID, displayName, role,
			).Scan(&user.ID, &user.Username, &user.DisplayName, &user.SystemRole, &user.Disabled)
		} else {
			err = tx.QueryRow(ctx, `
				UPDATE users
				SET display_name = $2, system_role = $3, disabled_at = NULL, updated_at = now()
				WHERE id = $1
				RETURNING id, username, display_name, system_role, disabled_at IS NOT NULL`,
				userID, displayName, role,
			).Scan(&user.ID, &user.Username, &user.DisplayName, &user.SystemRole, &user.Disabled)
		}
	} else {
		err = tx.QueryRow(ctx, `
			UPDATE users
			SET display_name = $2, system_role = $3, updated_at = now()
			WHERE id = $1
			RETURNING id, username, display_name, system_role, disabled_at IS NOT NULL`,
			userID, displayName, role,
		).Scan(&user.ID, &user.Username, &user.DisplayName, &user.SystemRole, &user.Disabled)
	}
	if err != nil {
		return User{}, mapStoreError("update user", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, fmt.Errorf("commit update user: %w", err)
	}
	return user, nil
}

func (s *Store) UpdateTeam(ctx context.Context, actor Principal, teamID, name string) (Team, error) {
	name = strings.TrimSpace(name)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Team{}, fmt.Errorf("begin update team: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeSystemAdminForUpdate(ctx, tx, actor.User.ID); err != nil {
		return Team{}, err
	}

	var team Team
	err = tx.QueryRow(ctx, `
		UPDATE teams
		SET name = $2
		WHERE id = $1
		RETURNING id, name`,
		teamID, name,
	).Scan(&team.ID, &team.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return Team{}, ErrNotFound
	}
	if err != nil {
		return Team{}, mapStoreError("update team", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Team{}, fmt.Errorf("commit update team: %w", err)
	}
	var role string
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(role, '')
		FROM team_members
		WHERE team_id = $1 AND user_id = $2`, teamID, actor.User.ID,
	).Scan(&role); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Team{}, fmt.Errorf("load updated team role: %w", err)
	}
	team.Role = role
	return team, nil
}

func (s *Store) DeleteTeam(ctx context.Context, actor Principal, teamID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete team: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeSystemAdminForUpdate(ctx, tx, actor.User.ID); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, "DELETE FROM teams WHERE id = $1", teamID)
	if err != nil {
		return mapStoreError("delete team", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit delete team: %w", err)
	}
	return nil
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
		return mapStoreError("add team member", err)
	}
	if result.RowsAffected() == 0 {
		return ErrForbidden
	}
	return nil
}

func (s *Store) SetTeamMemberRole(ctx context.Context, actor Principal, teamID, userID, role string) error {
	role = strings.TrimSpace(role)
	if !validTeamRole(role) {
		return ErrInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin set team member role: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeTeamAdminForUpdate(ctx, tx, actor.User.ID, teamID); err != nil {
		return err
	}
	currentRole, err := lockTeamMember(ctx, tx, teamID, userID)
	if err != nil {
		return err
	}
	if currentRole == "admin" && role != "admin" {
		if err := ensureAnotherTeamAdmin(ctx, tx, teamID, userID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, "UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2", teamID, userID, role); err != nil {
		return mapStoreError("set team member role", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit set team member role: %w", err)
	}
	return nil
}

func (s *Store) RemoveTeamMember(ctx context.Context, actor Principal, teamID, userID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin remove team member: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeTeamAdminForUpdate(ctx, tx, actor.User.ID, teamID); err != nil {
		return err
	}
	currentRole, err := lockTeamMember(ctx, tx, teamID, userID)
	if err != nil {
		return err
	}
	if currentRole == "admin" {
		if err := ensureAnotherTeamAdmin(ctx, tx, teamID, userID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", teamID, userID); err != nil {
		return mapStoreError("remove team member", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit remove team member: %w", err)
	}
	return nil
}

func (s *Store) SetUserTeamMemberships(ctx context.Context, actor Principal, userID string, assignments []TeamAssignment) error {
	normalized := make([]TeamAssignment, 0, len(assignments))
	seen := make(map[string]struct{}, len(assignments))
	for _, assignment := range assignments {
		teamID := strings.TrimSpace(assignment.TeamID)
		role := strings.TrimSpace(assignment.Role)
		if teamID == "" || !validTeamRole(role) {
			return ErrInvalid
		}
		if _, exists := seen[teamID]; exists {
			return ErrInvalid
		}
		seen[teamID] = struct{}{}
		normalized = append(normalized, TeamAssignment{TeamID: teamID, Role: role})
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin set user team memberships: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := authorizeSystemAdminForUpdate(ctx, tx, actor.User.ID); err != nil {
		return err
	}
	var targetExists bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 FOR UPDATE)", userID).Scan(&targetExists); err != nil {
		return fmt.Errorf("lock target user: %w", err)
	}
	if !targetExists {
		return ErrNotFound
	}

	rows, err := tx.Query(ctx, "SELECT team_id, role FROM team_members WHERE user_id = $1 FOR UPDATE", userID)
	if err != nil {
		return fmt.Errorf("load user memberships: %w", err)
	}
	current := make(map[string]string)
	for rows.Next() {
		var teamID, role string
		if err := rows.Scan(&teamID, &role); err != nil {
			rows.Close()
			return fmt.Errorf("scan user membership: %w", err)
		}
		current[teamID] = role
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("load user memberships: %w", err)
	}
	rows.Close()

	desired := make(map[string]string, len(normalized))
	for _, assignment := range normalized {
		desired[assignment.TeamID] = assignment.Role
	}
	for teamID, currentRole := range current {
		if currentRole == "admin" && desired[teamID] != "admin" {
			if err := ensureAnotherTeamAdmin(ctx, tx, teamID, userID); err != nil {
				return err
			}
		}
	}
	for teamID := range current {
		if _, keep := desired[teamID]; !keep {
			if _, err := tx.Exec(ctx, "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", teamID, userID); err != nil {
				return mapStoreError("delete user membership", err)
			}
		}
	}
	for _, assignment := range normalized {
		if _, err := tx.Exec(ctx, `
			INSERT INTO team_members (team_id, user_id, role)
			VALUES ($1, $2, $3)
			ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
			assignment.TeamID, userID, assignment.Role,
		); err != nil {
			return mapStoreError("upsert user membership", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit set user team memberships: %w", err)
	}
	return nil
}

func (s *Store) ListTeamMembers(ctx context.Context, actor Principal, teamID string) ([]TeamMember, error) {
	teamID = strings.TrimSpace(teamID)
	if actor.User.Disabled || teamID == "" {
		return nil, ErrForbidden
	}
	var authorized bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE users.id = $1
			  AND users.disabled_at IS NULL
			  AND users.system_role = 'admin'
		) OR EXISTS (
			SELECT 1
			FROM users
			JOIN team_members ON team_members.user_id = users.id
			WHERE users.id = $1
			  AND users.disabled_at IS NULL
			  AND team_members.team_id = $2
		)`, actor.User.ID, teamID).Scan(&authorized)
	if err != nil {
		return nil, fmt.Errorf("authorize list team members: %w", err)
	}
	if !authorized {
		return nil, ErrForbidden
	}

	rows, err := s.pool.Query(ctx, `
		SELECT users.id, users.username, users.display_name, users.system_role, users.disabled_at IS NOT NULL, team_members.role
		FROM team_members
		JOIN users ON users.id = team_members.user_id
		WHERE team_members.team_id = $1
		ORDER BY lower(users.username)`, teamID)
	if err != nil {
		return nil, fmt.Errorf("list team members: %w", err)
	}
	defer rows.Close()
	var members []TeamMember
	for rows.Next() {
		var member TeamMember
		if err := rows.Scan(
			&member.User.ID,
			&member.User.Username,
			&member.User.DisplayName,
			&member.User.SystemRole,
			&member.User.Disabled,
			&member.Role,
		); err != nil {
			return nil, fmt.Errorf("scan team member: %w", err)
		}
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list team members: %w", err)
	}
	return members, nil
}

func (s *Store) ListUsers(ctx context.Context, actor Principal) ([]User, error) {
	if actor.User.Disabled {
		return nil, ErrForbidden
	}
	if actor.User.SystemRole != "admin" {
		var hasAdminTeam bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM team_members
				WHERE user_id = $1 AND role = 'admin'
			)`, actor.User.ID).Scan(&hasAdminTeam); err != nil {
			return nil, fmt.Errorf("check team admin user listing: %w", err)
		}
		if !hasAdminTeam {
			return []User{actor.User}, nil
		}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, username, display_name, system_role, disabled_at IS NOT NULL
		FROM users
		ORDER BY username`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.Username, &user.DisplayName, &user.SystemRole, &user.Disabled); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	return users, nil
}

func (s *Store) ListTeams(ctx context.Context, actor Principal) ([]Team, error) {
	if actor.User.Disabled {
		return nil, ErrForbidden
	}
	rows, err := s.pool.Query(ctx, `
		SELECT teams.id, teams.name, COALESCE(team_members.role, '') AS role
		FROM teams
		LEFT JOIN team_members ON team_members.team_id = teams.id AND team_members.user_id = $1
		WHERE (
			team_members.user_id = $1
			OR EXISTS (
				SELECT 1
				FROM users
				WHERE users.id = $1
				  AND users.disabled_at IS NULL
				  AND users.system_role = 'admin'
			)
		)
		ORDER BY teams.name`, actor.User.ID)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()
	var teams []Team
	for rows.Next() {
		var team Team
		if err := rows.Scan(&team.ID, &team.Name, &team.Role); err != nil {
			return nil, fmt.Errorf("scan team: %w", err)
		}
		teams = append(teams, team)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	return teams, nil
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
	if errors.Is(err, pgx.ErrNoRows) {
		return Principal{}, ErrNotFound
	}
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

func authorizeSystemAdminForUpdate(ctx context.Context, tx pgx.Tx, userID string) error {
	var role string
	var disabled bool
	err := tx.QueryRow(ctx, `
		SELECT system_role, disabled_at IS NOT NULL
		FROM users
		WHERE id = $1
		FOR UPDATE`, userID).Scan(&role, &disabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return fmt.Errorf("authorize system admin: %w", err)
	}
	if disabled || role != "admin" {
		return ErrForbidden
	}
	return nil
}

func authorizeTeamAdminForUpdate(ctx context.Context, tx pgx.Tx, userID, teamID string) error {
	var role string
	var disabled bool
	err := tx.QueryRow(ctx, `
		SELECT system_role, disabled_at IS NOT NULL
		FROM users
		WHERE id = $1
		FOR UPDATE`, userID).Scan(&role, &disabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return fmt.Errorf("authorize team admin user: %w", err)
	}
	if disabled {
		return ErrForbidden
	}
	if role == "admin" {
		return nil
	}

	var teamRole string
	err = tx.QueryRow(ctx, `
		SELECT role
		FROM team_members
		WHERE team_id = $1 AND user_id = $2
		FOR UPDATE`, teamID, userID).Scan(&teamRole)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return fmt.Errorf("authorize team admin membership: %w", err)
	}
	if teamRole != "admin" {
		return ErrForbidden
	}
	return nil
}

func lockTeamMember(ctx context.Context, tx pgx.Tx, teamID, userID string) (string, error) {
	var role string
	err := tx.QueryRow(ctx, `
		SELECT role
		FROM team_members
		WHERE team_id = $1 AND user_id = $2
		FOR UPDATE`, teamID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("lock team member: %w", err)
	}
	return role, nil
}

func ensureAnotherTeamAdmin(ctx context.Context, tx pgx.Tx, teamID, excludedUserID string) error {
	rows, err := tx.Query(ctx, "SELECT user_id FROM team_members WHERE team_id = $1 FOR UPDATE", teamID)
	if err != nil {
		return fmt.Errorf("lock team admins: %w", err)
	}
	rows.Close()
	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM team_members
			WHERE team_id = $1 AND user_id <> $2 AND role = 'admin'
		)`, teamID, excludedUserID).Scan(&exists); err != nil {
		return fmt.Errorf("check another team admin: %w", err)
	}
	if !exists {
		return ErrLastTeamAdmin
	}
	return nil
}

func ensureAnotherActiveSystemAdmin(ctx context.Context, tx pgx.Tx, excludedUserID string) error {
	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE id <> $1
			  AND system_role = 'admin'
			  AND disabled_at IS NULL
		)`, excludedUserID).Scan(&exists); err != nil {
		return fmt.Errorf("check another system admin: %w", err)
	}
	if !exists {
		return ErrLastSystemAdmin
	}
	return nil
}

func validTeamRole(role string) bool {
	return role == "member" || role == "admin"
}

func mapStoreError(operation string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgUniqueViolation:
			return fmt.Errorf("%s: %w (%s)", operation, ErrConflict, pgErr.ConstraintName)
		case pgCheckViolation:
			return fmt.Errorf("%s: %w (%s)", operation, ErrInvalid, pgErr.ConstraintName)
		case pgForeignKeyViolation:
			return fmt.Errorf("%s: %w (%s)", operation, ErrNotFound, pgErr.ConstraintName)
		}
	}
	return fmt.Errorf("%s: %w", operation, err)
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
