DROP INDEX connections_personal_name;
DROP INDEX connections_team_name;

CREATE UNIQUE INDEX connections_personal_name
    ON connections(owner_user_id, kind, lower(name))
    WHERE scope = 'personal';

CREATE UNIQUE INDEX connections_team_name
    ON connections(team_id, kind, lower(name))
    WHERE scope = 'team';
