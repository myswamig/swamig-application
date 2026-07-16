PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  preferred_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  interest TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1)),
  country TEXT NOT NULL DEFAULT '',
  application_data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_created_at
ON applications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_email
ON applications(email);

CREATE INDEX IF NOT EXISTS idx_applications_status
ON applications(status);
