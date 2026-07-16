-- 1. Confirm the applications table exists.
SELECT name
FROM sqlite_schema
WHERE type = 'table'
ORDER BY name;

-- 2. Confirm application_data and status columns exist.
PRAGMA table_info(applications);

-- 3. Count every stored application.
SELECT COUNT(*) AS total_applications
FROM applications;

-- 4. Count rows populated by the long application.
SELECT COUNT(*) AS long_application_rows
FROM applications
WHERE application_data IS NOT NULL
  AND application_data <> '{}';

-- 5. Show the 10 newest records without printing the complete JSON answers.
SELECT
  id,
  submission_id,
  created_at,
  legal_name,
  email,
  interest,
  status,
  LENGTH(application_data) AS application_data_characters
FROM applications
ORDER BY id DESC
LIMIT 10;

-- 6. Check whether stored application_data is valid JSON.
SELECT
  submission_id,
  json_valid(application_data) AS valid_json,
  LENGTH(application_data) AS application_data_characters
FROM applications
ORDER BY id DESC
LIMIT 10;
