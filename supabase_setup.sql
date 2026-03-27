-- Run this in Supabase SQL Editor
-- Go to: supabase.com → your project → SQL Editor → paste this → click Run

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- Insert default admin user
INSERT INTO users (id, data) VALUES (
  'admin',
  '{"id":"admin","username":"admin","password":"123","role":"admin","name":"Administrator"}'
) ON CONFLICT (id) DO NOTHING;

SELECT 'Setup complete! Tables created.' as status;
