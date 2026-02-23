CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ai_provider TEXT DEFAULT 'gemini',
  ai_base_url TEXT,
  ai_model TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
