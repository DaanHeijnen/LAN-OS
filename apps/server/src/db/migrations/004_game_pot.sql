-- The game pot: games players would like to play. Before the tournament starts, an admin draws a few
-- at random and they join the lineup. One pot per LAN.
CREATE TABLE game_pot (
  id                  INTEGER PRIMARY KEY,
  lan_id              TEXT NOT NULL REFERENCES lans(id),
  player_id           TEXT NOT NULL,
  name                TEXT NOT NULL,
  link                TEXT,
  how                 TEXT,
  state               TEXT NOT NULL CHECK (state IN ('waiting', 'approved', 'rejected', 'drawn')),
  note                TEXT,                                          -- why an admin rejected it
  added_at            TEXT NOT NULL,
  drawn_at            TEXT,
  draw_order          INTEGER,                                       -- 1 = drawn first
  tournament_id       INTEGER REFERENCES tournaments(id),
  tournament_game_id  INTEGER REFERENCES tournament_games(id) ON DELETE SET NULL
);
CREATE INDEX game_pot_by_lan ON game_pot (lan_id, state);
