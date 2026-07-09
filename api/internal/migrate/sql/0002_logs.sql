CREATE TABLE log_sessions (
    id text PRIMARY KEY,
    name text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'indexing', 'ready', 'failed')),
    scope text NOT NULL CHECK (scope IN ('personal', 'team')),
    owner_user_id text REFERENCES users(id) ON DELETE CASCADE,
    team_id text REFERENCES teams(id) ON DELETE CASCADE,
    created_by text NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    error_message text,
    CHECK (
        (scope = 'personal' AND owner_user_id IS NOT NULL AND team_id IS NULL)
        OR (scope = 'team' AND owner_user_id IS NULL AND team_id IS NOT NULL)
    )
);

CREATE INDEX log_sessions_owner_created
    ON log_sessions(owner_user_id, created_at DESC)
    WHERE scope = 'personal';

CREATE INDEX log_sessions_team_created
    ON log_sessions(team_id, created_at DESC)
    WHERE scope = 'team';

CREATE TABLE log_source_files (
    id text PRIMARY KEY,
    session_id text NOT NULL REFERENCES log_sessions(id) ON DELETE CASCADE,
    service_name text NOT NULL,
    node_name text NOT NULL,
    original_name text NOT NULL,
    storage_path text NOT NULL,
    total_lines integer NOT NULL DEFAULT 0,
    parse_status text NOT NULL CHECK (parse_status IN ('pending', 'done', 'failed')),
    source_type text NOT NULL DEFAULT 'local',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX log_source_files_session_status
    ON log_source_files(session_id, parse_status);

CREATE INDEX log_source_files_session_scope
    ON log_source_files(session_id, service_name, node_name);

CREATE TABLE log_entries (
    id bigserial PRIMARY KEY,
    session_id text NOT NULL REFERENCES log_sessions(id) ON DELETE CASCADE,
    source_file_id text NOT NULL REFERENCES log_source_files(id) ON DELETE CASCADE,
    timestamp_ms bigint,
    level text NOT NULL,
    service_name text NOT NULL,
    node_name text NOT NULL,
    message text NOT NULL,
    raw text NOT NULL,
    line_number integer NOT NULL
);

CREATE INDEX log_entries_session_time
    ON log_entries(session_id, timestamp_ms NULLS LAST, id);

CREATE INDEX log_entries_session_scope_time
    ON log_entries(session_id, service_name, node_name, timestamp_ms NULLS LAST, id);

CREATE INDEX log_entries_session_level_time
    ON log_entries(session_id, level, timestamp_ms NULLS LAST, id);

CREATE INDEX log_entries_session_file_line
    ON log_entries(session_id, source_file_id, line_number);

CREATE TABLE log_scope_stats (
    session_id text NOT NULL REFERENCES log_sessions(id) ON DELETE CASCADE,
    service_name text NOT NULL,
    node_name text NOT NULL,
    line_count bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, service_name, node_name)
);

CREATE TABLE log_time_buckets (
    session_id text NOT NULL REFERENCES log_sessions(id) ON DELETE CASCADE,
    bucket_start_ms bigint NOT NULL,
    bucket_size_ms bigint NOT NULL,
    count integer NOT NULL DEFAULT 0,
    error_count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, bucket_start_ms, bucket_size_ms)
);
