-- Persist gameplay mode and host-less answer submission state.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS gameplay_mode TEXT NOT NULL DEFAULT 'hosted'
  CHECK (gameplay_mode IN ('hosted', 'hostless'));

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS answer_state JSONB NOT NULL DEFAULT '{"status":"locked","questionId":null,"winner":null,"recentAttempts":[]}'::jsonb;
