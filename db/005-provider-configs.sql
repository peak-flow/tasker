-- Replace single-row settings with per-provider config rows
DROP TABLE IF EXISTS settings;

CREATE TABLE IF NOT EXISTS provider_configs (
  provider TEXT PRIMARY KEY,
  base_url TEXT,
  model TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
