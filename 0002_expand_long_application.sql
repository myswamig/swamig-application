-- Run this only on an EXISTING applications table that does not yet contain
-- application_data and status. Existing rows are preserved.

ALTER TABLE applications
ADD COLUMN application_data TEXT NOT NULL DEFAULT '{}';

ALTER TABLE applications
ADD COLUMN status TEXT NOT NULL DEFAULT 'New';

CREATE INDEX IF NOT EXISTS idx_applications_status
ON applications(status);
