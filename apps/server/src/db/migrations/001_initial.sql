-- LAN OS database, first version.
-- Times are ISO 8601 in UTC ("2026-11-19T18:00:00.000Z"). Player ids are the `id` values from config/players.yaml.

-- One row per LAN weekend (lan_id from config/event.yaml). All LANs live in this one database,
-- so stats can be compared year over year.
CREATE TABLE lans (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  timezone    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Everything that happened, append-only and kept across LANs. Rows are never changed;
-- an admin may only remove an incorrect row.
CREATE TABLE events (
  id           INTEGER PRIMARY KEY,
  lan_id       TEXT NOT NULL REFERENCES lans(id),
  type         TEXT NOT NULL CHECK (type IN (
                 'game_session_started', 'game_session_ended', 'presence_changed',
                 'song_requested', 'song_played', 'vote_cast', 'activity', 'announcement')),
  player_id    TEXT,                                   -- NULL for room-wide events
  occurred_at  TEXT NOT NULL,
  data         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data))
);
CREATE INDEX events_by_lan_type ON events (lan_id, type, occurred_at);
CREATE INDEX events_by_player ON events (lan_id, player_id, occurred_at);
CREATE TRIGGER events_are_append_only BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

-- A player's personal settings for one LAN. A new lan_id starts everyone fresh.
CREATE TABLE player_profiles (
  lan_id               TEXT NOT NULL REFERENCES lans(id),
  player_id            TEXT NOT NULL,
  looking_for_players  INTEGER NOT NULL DEFAULT 0 CHECK (looking_for_players IN (0, 1)),
  manual_game          TEXT,                           -- non-Steam or corrected game; NULL = use Steam
  dashboard_layout     TEXT CHECK (dashboard_layout IS NULL OR json_valid(dashboard_layout)),
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (lan_id, player_id)
);

-- Personal join links (/join/<token>), made by an admin. The token is kept so admins can copy the link again.
CREATE TABLE join_links (
  token       TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX join_links_by_player ON join_links (player_id);

-- Signed-in browsers. Only a hash of the cookie is stored.
-- kind 'player' = a player's browser; 'admin' = signed in with the admin password from .env.
CREATE TABLE sessions (
  id_hash       TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('player', 'admin')),
  player_id     TEXT,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  CHECK (kind = 'admin' OR player_id IS NOT NULL)
);

-- Optional 4-digit PIN per player, for returning on a new browser. Stored as a salted scrypt hash.
CREATE TABLE player_pins (
  player_id   TEXT PRIMARY KEY,
  pin_hash    TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Live switches that must survive a restart: wall blanked or paused, the projector message, paused integrations.
CREATE TABLE runtime_state (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL CHECK (json_valid(value)),
  updated_at  TEXT NOT NULL
);
