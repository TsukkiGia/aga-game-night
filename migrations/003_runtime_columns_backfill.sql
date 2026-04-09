-- Backfill runtime persistence columns in case earlier migration history was out of sync.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS host_question_cursor JSONB;

ALTER TABLE buzz_state
  ADD COLUMN IF NOT EXISTS buzzed_member_name TEXT,
  ADD COLUMN IF NOT EXISTS allowed_team_indices INTEGER[];

