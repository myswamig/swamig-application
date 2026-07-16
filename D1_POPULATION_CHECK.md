# Step-by-Step Guide: Check D1 Population

Use this procedure after every initial deployment, schema change, or form change.

## What “D1 is populated” means

Three separate conditions must be true:

1. the Pages Function can reach the D1 binding named `DB`
2. the `applications` table has the long-form columns
3. at least one submitted form produced a row whose `application_data` is not `{}`

## Method A — Browser check

### 1. Open the check page

```text
https://sgiapp.pages.dev/d1-check.html
```

### 2. Select “Check D1 Now”

Confirm:

```text
ok: true
d1: connected
schema: ready
applicationDataColumn: true
statusColumn: true
```

Record these two numbers:

```text
totalApplications
fullApplicationRows
```

Before testing, note the current totals.

### 3. Submit one complete test application

Open:

```text
https://sgiapp.pages.dev/
```

After the success message appears, copy the confirmation number.

### 4. Check again

Return to `d1-check.html` and run the check again.

Expected result:

- `totalApplications` increased by 1
- `fullApplicationRows` increased by 1
- `latestCreatedAt` changed to the new submission time

## Method B — Cloudflare D1 dashboard console

### 1. Open the correct database

In Cloudflare:

```text
Workers & Pages
→ D1 SQL Database
→ yourbabalawo-db
→ Console
```

### 2. Confirm the table

Run:

```sql
SELECT name
FROM sqlite_schema
WHERE type = 'table'
ORDER BY name;
```

Expected table:

```text
applications
```

### 3. Confirm the columns

Run:

```sql
PRAGMA table_info(applications);
```

Required columns include:

```text
submission_id
legal_name
email
application_data
status
created_at
```

If `application_data` or `status` is absent, run the migration once:

```text
migrations/0002_expand_long_application.sql
```

### 4. Count all rows

Run:

```sql
SELECT COUNT(*) AS total_applications
FROM applications;
```

### 5. Count long-form rows

Run:

```sql
SELECT COUNT(*) AS long_application_rows
FROM applications
WHERE application_data IS NOT NULL
  AND application_data <> '{}';
```

### 6. Inspect the newest records

Run:

```sql
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
```

Interpretation:

- no rows: nothing has reached this database
- newest row appears: the form inserted into D1
- `application_data_characters = 2`: the value is only `{}` and the long answers are not populated
- a much larger value: the long application JSON was stored

### 7. Find the exact confirmation

Replace the sample value with the UUID shown by the form:

```sql
SELECT
  submission_id,
  created_at,
  legal_name,
  email,
  status,
  LENGTH(application_data) AS application_data_characters,
  application_data
FROM applications
WHERE submission_id = 'PASTE-CONFIRMATION-HERE';
```

Expected result: exactly one row.

### 8. Validate the stored JSON

Run:

```sql
SELECT
  submission_id,
  json_valid(application_data) AS valid_json,
  LENGTH(application_data) AS application_data_characters
FROM applications
ORDER BY id DESC
LIMIT 10;
```

Expected `valid_json` value:

```text
1
```

## Method C — Wrangler commands

Run these from the repository root.

### Complete verification file

```bash
npx wrangler d1 execute yourbabalawo-db --remote --file=./VERIFY_D1.sql
```

### Count rows only

```bash
npx wrangler d1 execute yourbabalawo-db --remote --command="SELECT COUNT(*) AS total_applications FROM applications;"
```

### Show newest records

```bash
npx wrangler d1 execute yourbabalawo-db --remote --command="SELECT submission_id, created_at, legal_name, email, LENGTH(application_data) AS application_data_characters FROM applications ORDER BY id DESC LIMIT 10;"
```

### Find one confirmation number

```bash
npx wrangler d1 execute yourbabalawo-db --remote --command="SELECT submission_id, created_at, legal_name, email, LENGTH(application_data) AS application_data_characters FROM applications WHERE submission_id='PASTE-CONFIRMATION-HERE';"
```

The `--remote` flag is essential. Without it, Wrangler queries the separate local development database.

## Method D — Protected review page

Open:

```text
https://sgiapp.pages.dev/admin.html
```

Enter `ADMIN_TOKEN` and load applications.

Confirm that the newest card shows:

- the same confirmation number
- applicant summary fields
- complete formatted `application_data` JSON

## Troubleshooting decision path

### Browser says `d1: not-bound`

Add the D1 Pages binding:

```text
DB → yourbabalawo-db
```

Redeploy.

### Browser says the table is missing

Run `schema.sql` against the remote database.

### SQL says `no such column: application_data`

Run the existing-table migration once.

### Submission succeeds but the count does not change

Check that the Pages project and the dashboard console are using the same D1 database. Confirm the Pages binding points to `yourbabalawo-db`, then redeploy and repeat the test.

### Count changes but `application_data` remains `{}`

Confirm the deployed file is the supplied `functions/submit.js`, not the older short test handler. Redeploy after replacing it.

### Admin page says `Unauthorized`

Re-enter the exact `ADMIN_TOKEN`. The token is case-sensitive.
