-- LAN Radio, polls, activities and the Shared Game Finder.
-- These tables hold the live state; everything that happened is also written to `events`.

-- LAN OS's own music queue. Songs wait here (fair DJ rotation) until LAN OS hands them to Spotify.
CREATE TABLE radio_requests (
  id            INTEGER PRIMARY KEY,
  lan_id        TEXT NOT NULL REFERENCES lans(id),
  player_id     TEXT NOT NULL,
  track_uri     TEXT NOT NULL,
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL,
  album_art     TEXT,
  duration_ms   INTEGER NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('waiting', 'sent', 'playing', 'played', 'removed', 'skipped')),
  requested_at  TEXT NOT NULL,
  sent_at       TEXT,
  started_at    TEXT,
  ended_at      TEXT
);
CREATE INDEX radio_requests_by_state ON radio_requests (lan_id, state, requested_at);

-- Polls: one main poll plus side polls at a time.
CREATE TABLE polls (
  id            INTEGER PRIMARY KEY,
  lan_id        TEXT NOT NULL REFERENCES lans(id),
  created_by    TEXT NOT NULL,
  question      TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('choice', 'yes_no_maybe')),
  options       TEXT NOT NULL CHECK (json_valid(options)),
  anonymous     INTEGER NOT NULL DEFAULT 0 CHECK (anonymous IN (0, 1)),
  is_main       INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0, 1)),
  created_at    TEXT NOT NULL,
  closes_at     TEXT NOT NULL,
  closed_at     TEXT,
  close_reason  TEXT CHECK (close_reason IS NULL OR close_reason IN ('timer', 'everyone_voted', 'creator', 'admin', 'removed')),
  winner        INTEGER
);
CREATE INDEX polls_open ON polls (lan_id, closed_at);

CREATE TABLE poll_votes (
  poll_id         INTEGER NOT NULL REFERENCES polls(id),
  player_id       TEXT NOT NULL,
  option_index    INTEGER NOT NULL,
  first_voted_at  TEXT NOT NULL,
  voted_at        TEXT NOT NULL,
  PRIMARY KEY (poll_id, player_id)
);

-- Activities: a game together, a food break, something IRL.
CREATE TABLE activities (
  id            INTEGER PRIMARY KEY,
  lan_id        TEXT NOT NULL REFERENCES lans(id),
  created_by    TEXT NOT NULL,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('game', 'group_session', 'food_break', 'irl')),
  starts_at     TEXT NOT NULL,
  min_players   INTEGER NOT NULL,
  max_players   INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  ended_at      TEXT,
  cancelled_at  TEXT
);

CREATE TABLE activity_rsvps (
  activity_id  INTEGER NOT NULL REFERENCES activities(id),
  player_id    TEXT NOT NULL,
  answer       TEXT NOT NULL CHECK (answer IN ('join', 'maybe', 'skip')),
  eta_minutes  INTEGER,
  answered_at  TEXT NOT NULL,
  PRIMARY KEY (activity_id, player_id)
);

-- Games each player owns, fetched from Steam for the Shared Game Finder (needs a Steam Web API key).
CREATE TABLE owned_games (
  steam_id    TEXT NOT NULL,
  app_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (steam_id, app_id)
);
