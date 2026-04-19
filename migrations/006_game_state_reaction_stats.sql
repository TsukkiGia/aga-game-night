-- Persist host reaction-time leaderboard stats across reconnects.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS reaction_stats JSONB NOT NULL DEFAULT '{}'::jsonb;
