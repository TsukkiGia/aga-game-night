-- Persist immutable custom round templates and per-session round catalogs.

CREATE TABLE IF NOT EXISTS round_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type = 'custom-buzz'),
  intro TEXT NOT NULL DEFAULT '',
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring JSONB NOT NULL,
  questions JSONB NOT NULL,
  created_by_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS round_templates_created_at_idx
  ON round_templates (created_at DESC);

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS round_catalog JSONB NOT NULL DEFAULT '[]'::jsonb;
