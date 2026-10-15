-- The tournament: a lineup of games played through the night, scored by placement.

-- One tournament at a time per LAN (state 'closed' ends it; the results stay for LAN Wrapped).
CREATE TABLE tournaments (
  id           INTEGER PRIMARY KEY,
  lan_id       TEXT NOT NULL REFERENCES lans(id),
  name         TEXT NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('setup', 'live', 'finished', 'closed')),
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX tournaments_by_lan ON tournaments (lan_id, state);

-- The lineup. Bingo settings are only used for kind 'bingo'; teams only for kind 'teams'.
CREATE TABLE tournament_games (
  id                   INTEGER PRIMARY KEY,
  tournament_id        INTEGER NOT NULL REFERENCES tournaments(id),
  position             INTEGER NOT NULL,
  name                 TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('solo', 'teams', 'bingo')),
  state                TEXT NOT NULL CHECK (state IN ('upcoming', 'live', 'finished')),
  teams                TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(teams)),        -- [{ name, playerIds }]
  bingo_ideas          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(bingo_ideas)),  -- the pool cards are drawn from
  bingo_minutes        INTEGER,
  bingo_square_points  INTEGER,
  bingo_line_points    INTEGER,
  bingo_full_points    INTEGER,
  bingo_ends_at        TEXT,
  started_at           TEXT,
  finished_at          TEXT
);

-- One row per scored round. placings: groups of entries in finishing order (a group is a tie).
-- Entries are player ids, or team numbers in a team game (with the teams as they were in that round).
CREATE TABLE tournament_rounds (
  id           INTEGER PRIMARY KEY,
  game_id      INTEGER NOT NULL REFERENCES tournament_games(id),
  number       INTEGER NOT NULL,
  placings     TEXT NOT NULL CHECK (json_valid(placings)),
  teams        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(teams)),
  recorded_at  TEXT NOT NULL
);

-- Tournament points handed out when a game is finished.
CREATE TABLE tournament_results (
  game_id     INTEGER NOT NULL REFERENCES tournament_games(id),
  player_id   TEXT NOT NULL,
  game_score  INTEGER NOT NULL,
  place       INTEGER NOT NULL,
  points      INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id)
);

-- Each player's bingo card: squares drawn from the game's ideas when the game starts.
CREATE TABLE bingo_cards (
  game_id    INTEGER NOT NULL REFERENCES tournament_games(id),
  player_id  TEXT NOT NULL,
  squares    TEXT NOT NULL CHECK (json_valid(squares)),
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE bingo_ticks (
  game_id    INTEGER NOT NULL REFERENCES tournament_games(id),
  player_id  TEXT NOT NULL,
  square     INTEGER NOT NULL,
  ticked_at  TEXT NOT NULL,
  PRIMARY KEY (game_id, player_id, square)
);
