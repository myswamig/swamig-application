# SwamiG Institute Application — Cloudflare Pages + D1

This package is a complete Cloudflare Pages application for `sgiapp.pages.dev` and the GitHub repository `myswamig/swamig-application`.

It includes:

- a six-step SGI long application in `index.html`
- `functions/submit.js`, which validates the form and stores the basic fields plus the complete long-form answers in `application_data`
- a public D1 readiness and record-count endpoint at `/api/health`
- a browser check page at `d1-check.html`
- a protected application review page at `admin.html`
- a protected API at `/api/submissions`
- a complete new-install schema and an existing-table migration
- SQL and command-line procedures for confirming that D1 is populated

## Required repository structure

Upload the contents of this package into the repository root. Do not put the `functions` folder inside another folder.

```text
/
├── index.html
├── admin.html
├── d1-check.html
├── schema.sql
├── VERIFY_D1.sql
├── wrangler.toml.example
├── _headers
├── _routes.json
├── SwamiG.gif
├── tn_10.jpg
├── tn_2.jpg
├── tn_4cowrie.jpg
├── migrations/
│   └── 0002_expand_long_application.sql
└── functions/
    ├── submit.js
    └── api/
        ├── config.js
        ├── health.js
        └── submissions.js
```

Cloudflare Pages maps files in a root-level `functions` directory to routes. In this project:

- `functions/submit.js` becomes `/submit`
- `functions/api/health.js` becomes `/api/health`
- `functions/api/config.js` becomes `/api/config`
- `functions/api/submissions.js` becomes `/api/submissions`

## Step 1 — Put the files in GitHub

Replace the corresponding files in:

```text
myswamig/swamig-application
```

Commit the changes to the branch connected to the Cloudflare Pages project.

Recommended Pages build settings:

```text
Framework preset: None
Build command: leave blank
Build output directory: .
Root directory: leave blank
```

## Step 2 — Prepare the D1 table

The D1 binding name used by every Function is exactly:

```text
DB
```

The database currently designated for this project is:

```text
yourbabalawo-db
```

### New or empty database

Open the D1 database in Cloudflare, select **Console**, paste the full contents of `schema.sql`, and execute it.

Command-line alternative:

```bash
npx wrangler d1 execute yourbabalawo-db --remote --file=./schema.sql
```

### Existing `applications` table

First run:

```sql
PRAGMA table_info(applications);
```

If `application_data` and `status` are already listed, do not run the migration again.

If they are missing, run:

```bash
npx wrangler d1 execute yourbabalawo-db --remote --file=./migrations/0002_expand_long_application.sql
```

The migration preserves existing rows and adds:

```text
application_data TEXT NOT NULL DEFAULT '{}'
status TEXT NOT NULL DEFAULT 'New'
```

## Step 3 — Bind D1 to the Pages project

In Cloudflare:

```text
Workers & Pages
→ select the sgiapp Pages project
→ Settings
→ Bindings
→ Add binding
→ D1 database
```

Set:

```text
Variable name: DB
D1 database: yourbabalawo-db
```

Save the binding.

## Step 4 — Add variables and encrypted secrets

In the Pages project, open **Settings → Variables and Secrets**.

Add:

```text
ADMIN_TOKEN                encrypted secret
TURNSTILE_SITE_KEY         normal variable
TURNSTILE_SECRET_KEY       encrypted secret
```

Optional hostname verification:

```text
TURNSTILE_EXPECTED_HOSTNAME = sgiapp.pages.dev
```

For a custom production domain, use that hostname instead. Do not place any secret value in HTML, JavaScript committed to GitHub, `wrangler.toml.example`, or this README.

`ALLOW_UNVERIFIED_LOCAL=true` appears only in the Wrangler example for local development. The bypass is accepted only for localhost requests. Do not add it as a production Pages variable.

## Step 5 — Redeploy

After changing files, bindings, variables, or secrets, create a new Pages deployment. A binding added after an older deployment does not change that already completed deployment.

## Step 6 — Test the connection before submitting

Open:

```text
https://sgiapp.pages.dev/d1-check.html
```

Select **Check D1 Now**.

A healthy result includes:

```json
{
  "ok": true,
  "d1": "connected",
  "schema": "ready",
  "applicationDataColumn": true,
  "statusColumn": true
}
```

A total of `0` is normal before the first successful submission.

## Step 7 — Submit a test application

Open:

```text
https://sgiapp.pages.dev/
```

Complete all six steps and submit. Copy the confirmation UUID displayed after success.

Example form response:

```text
Application received and saved to D1.
Confirmation: 00000000-0000-4000-8000-000000000000
```

## Step 8 — Confirm D1 population

Follow `D1_POPULATION_CHECK.md`. The fastest checks are:

```sql
SELECT COUNT(*) AS total_applications FROM applications;
```

and:

```sql
SELECT
  submission_id,
  created_at,
  legal_name,
  email,
  LENGTH(application_data) AS application_data_characters
FROM applications
ORDER BY id DESC
LIMIT 10;
```

For the exact confirmation number:

```sql
SELECT *
FROM applications
WHERE submission_id = 'PASTE-CONFIRMATION-HERE';
```

A long application normally has an `application_data` length substantially greater than `2`; `{}` has a length of only `2`.

## Step 9 — Review complete applications

Open:

```text
https://sgiapp.pages.dev/admin.html
```

Enter the exact `ADMIN_TOKEN` value. The page displays summary fields and formatted `application_data` JSON.

## Wrangler local development

1. Copy `wrangler.toml.example` to `wrangler.toml`.
2. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
3. Initialize the local database.
4. Start Pages locally.

```bash
cp wrangler.toml.example wrangler.toml
npx wrangler d1 execute yourbabalawo-db --local --file=./schema.sql
npx wrangler pages dev .
```

Local D1 data is separate from the remote production database. Use `--remote` when the purpose is to inspect or alter production D1.

## Common errors

### `D1 binding DB is not configured.`

The Pages project has no D1 binding named exactly `DB`, the wrong environment was configured, or the site was not redeployed after adding the binding.

### `The applications table does not exist. Run schema.sql.`

D1 is connected, but `schema.sql` has not been applied to the bound database.

### `no such column: application_data`

The old table is still active. Run `migrations/0002_expand_long_application.sql` once.

### `Turnstile is not configured on the server.`

Add `TURNSTILE_SECRET_KEY` as an encrypted secret and `TURNSTILE_SITE_KEY` as a normal variable, then redeploy.

### `Security verification failed.`

The Turnstile site and secret keys may not belong to the same widget, the hostname may not be allowed, or the token may already have been used.

### `Unauthorized.`

The value entered on `admin.html` does not exactly match the Pages secret `ADMIN_TOKEN`.

## Privacy and access

The database contains names, contact information, spiritual background, program interests, personal statements, and agreements. Use a strong `ADMIN_TOKEN`, do not share it, and place the admin route behind Cloudflare Access for stronger production protection.

## Official documentation used for this package

- Cloudflare Pages Functions: `https://developers.cloudflare.com/pages/functions/`
- Pages bindings: `https://developers.cloudflare.com/pages/functions/bindings/`
- D1 getting started: `https://developers.cloudflare.com/d1/get-started/`
- D1 Wrangler commands: `https://developers.cloudflare.com/d1/wrangler-commands/`
- D1 SQL statements: `https://developers.cloudflare.com/d1/sql-api/sql-statements/`
