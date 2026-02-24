CREATE TABLE IF NOT EXISTS ai_logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  provider TEXT NOT NULL,
  model TEXT,
  endpoint TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT,
  error TEXT,
  duration_ms INTEGER
);
