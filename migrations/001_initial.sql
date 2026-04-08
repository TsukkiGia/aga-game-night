-- Sankofa Showdown — initial schema
-- Run once against a fresh database.

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT        PRIMARY KEY,           -- short alphanumeric code, e.g. XK4F
  pin_hash    TEXT        NOT NULL,              -- bcrypt hash of host-chosen PIN
  status      TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'ended'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idx         INTEGER     NOT NULL,              -- 0-based position
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL,
  score       INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, idx)
);

CREATE TABLE IF NOT EXISTS game_state (
  session_id      TEXT        PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  round_index     INTEGER     NOT NULL DEFAULT 0,
  question_index  INTEGER,                       -- NULL means round intro
  armed           BOOLEAN     NOT NULL DEFAULT FALSE,
  streaks         INTEGER[]   NOT NULL DEFAULT '{}',
  done_questions  TEXT[]      NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS buzz_state (
  session_id          TEXT        PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  winner_team_index   INTEGER,                   -- NULL when no active buzz
  locked_out          INTEGER[]   NOT NULL DEFAULT '{}'
);
