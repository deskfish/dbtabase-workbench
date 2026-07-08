CREATE TABLE users (
    id text PRIMARY KEY,
    username text NOT NULL UNIQUE,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    system_role text NOT NULL CHECK (system_role IN ('member', 'admin')),
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id text PRIMARY KEY,
    name text NOT NULL UNIQUE,
    created_by text NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
    team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('member', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE connections (
    id text PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('database', 'ssh')),
    driver text NOT NULL CHECK (driver IN ('mysql', 'postgres', 'mongodb', 'redis', 'ssh')),
    scope text NOT NULL CHECK (scope IN ('personal', 'team')),
    owner_user_id text REFERENCES users(id) ON DELETE CASCADE,
    team_id text REFERENCES teams(id) ON DELETE CASCADE,
    endpoint jsonb NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    secret_key_id text NOT NULL,
    secret_ciphertext bytea NOT NULL,
    created_by text NOT NULL REFERENCES users(id),
    updated_by text NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (scope = 'personal' AND owner_user_id IS NOT NULL AND team_id IS NULL)
        OR (scope = 'team' AND owner_user_id IS NULL AND team_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX connections_personal_name
    ON connections(owner_user_id, lower(name))
    WHERE scope = 'personal';

CREATE UNIQUE INDEX connections_team_name
    ON connections(team_id, lower(name))
    WHERE scope = 'team';

CREATE TABLE audit_events (
    id bigserial PRIMARY KEY,
    actor_user_id text REFERENCES users(id),
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
