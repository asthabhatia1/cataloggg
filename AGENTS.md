# Agent instructions

## Project

This is an Express catalog app deployed as a Vercel function. Production data belongs in Supabase Postgres, public catalog images in Supabase Storage, and admin sessions in Postgres. Read [README.md](./README.md) before changing deployment, database, storage, or migration behavior.

## Connecting a project

When asked to connect or deploy this repository:

1. Check the README, deployment configuration, current git changes, and required environment variable names before making changes.
2. Use the user's existing Supabase and Vercel projects. Do not create, delete, reset, or replace a project or database without explicit approval.
3. If project access or credentials are unavailable, tell the user exactly what access or setup is needed and stop before any production change. Never request that secrets be pasted into chat.
4. Apply the SQL migration in `supabase/migrations/20261104000000_catalog.sql` to the intended Supabase project before deploying code that requires its schema.
5. Configure `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` through the local ignored `.env` file or the deployment provider's secret settings. Keep the service-role key server-side. Never print, commit, or add secret values to logs or documentation.
6. Confirm the target database is empty or obtain explicit approval before importing. `npm run migrate:json` overwrites matching catalog IDs and website settings. Run it only against the user-selected environment.
7. Deploy, check `/api/health`, `/api/catalog`, and `/admin`, then run the documented staging integration tests when suitable credentials and a staging target are available. Do not run destructive integration tests against production.
8. Report which steps succeeded, which still require the user, and any migration/import warnings. Do not claim a live connection until it has been verified.

## Validation

- Run `npm test` and `git diff --check` after relevant changes.
- Use `npm run test:integration` only with `TEST_BASE_URL` and `TEST_ADMIN_PASSWORD` for a disposable staging deployment; it creates and deletes catalog records.
- Follow [README.md](./README.md) for setup, migrations, deployment variables, smoke checks, and operational requirements.
