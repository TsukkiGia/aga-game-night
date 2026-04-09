-- Persist configured game plan item ids (round/question sequence).

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS game_plan TEXT[] NOT NULL DEFAULT '{}';

