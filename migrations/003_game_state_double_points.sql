-- Persist whether double-points mode is currently active.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS double_points BOOLEAN NOT NULL DEFAULT FALSE;
