-- Song ratings, daily side quests and live achievements.

-- A thumbs up (1) or down (-1) on a song while it played. play_event_id is the song_played event of that play,
-- so the requester and title come from the event log. One thumb per player per play.
CREATE TABLE song_ratings (
  lan_id         TEXT NOT NULL REFERENCES lans(id),
  play_event_id  INTEGER NOT NULL,
  player_id      TEXT NOT NULL,
  rating         INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  rated_at       TEXT NOT NULL,
  PRIMARY KEY (play_event_id, player_id)
);
CREATE INDEX song_ratings_by_lan ON song_ratings (lan_id);

-- The side quests each player got on each LAN day. done_at is set when they tick it off.
CREATE TABLE side_quests (
  id           INTEGER PRIMARY KEY,
  lan_id       TEXT NOT NULL REFERENCES lans(id),
  day          INTEGER NOT NULL,
  player_id    TEXT NOT NULL,
  quest        TEXT NOT NULL,
  assigned_at  TEXT NOT NULL,
  done_at      TEXT,
  UNIQUE (lan_id, day, player_id, quest)
);
CREATE INDEX side_quests_by_day ON side_quests (lan_id, day);

-- Achievements earned: each player can earn each one once per LAN.
CREATE TABLE achievements (
  lan_id          TEXT NOT NULL REFERENCES lans(id),
  player_id       TEXT NOT NULL,
  achievement_id  TEXT NOT NULL,
  earned_at       TEXT NOT NULL,
  detail          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (lan_id, player_id, achievement_id)
);
