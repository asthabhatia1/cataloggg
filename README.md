# Catalog

Express-based catalog and admin site. Catalog records live in Supabase Postgres, images live in a public Supabase Storage bucket, and authenticated admin sessions are persisted in Postgres. The Vercel function is stateless; no catalog data or uploaded image depends on its local filesystem.

## Local setup

Requirements: Node.js 20.6 or newer, a Supabase project, and the project database connection string.

1. Copy `.env.example` to `.env` and set every value. Generate a session secret with `openssl rand -base64 48`; choose a unique admin password of at least 12 characters. Use the Supabase **transaction pooler** connection string and keep the service-role key server-side.
2. In the Supabase SQL Editor, run [`supabase/migrations/20261104000000_catalog.sql`](./supabase/migrations/20261104000000_catalog.sql). This creates the catalog tables, session and login-rate-limit tables, and the public image bucket.
3. Install packages and import the checked-in JSON catalog and available local images:

   ```sh
   npm install
   npm run migrate:json
   ```

   The importer is safe to re-run for the same catalog IDs. It transfers local files and legacy base64 image data into Storage. If a local file referenced by `data/store.json` is missing, it reports that image and imports the rest of the catalog without that image.
4. Start the app with `npm start`; open `http://localhost:3000` and `/admin`.

The JSON catalog remains in the repository as an import source and recovery reference; the running site does not read or write it.

## Deployment

Configure these Vercel environment variables for **Production**, **Preview**, and **Development** as appropriate:

- `DATABASE_URL`: Supabase transaction-pooler connection string with TLS enabled (`sslmode=require`).
- `ADMIN_PASSWORD`: unique admin password, at least 12 characters.
- `SESSION_SECRET`: cryptographically random secret, at least 32 characters.
- `SUPABASE_URL`: project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key; never expose it to browser code.
- `SUPABASE_STORAGE_BUCKET`: optional; defaults to `catalog`.

### First-time connection checklist

Use this sequence when connecting a fresh checkout to an existing Supabase and Vercel project:

1. Select the intended Supabase and Vercel projects. Prefer connecting and testing a development/staging environment first. Never reset or replace an existing project as part of setup.
2. In the Supabase SQL Editor for the selected project, run [`supabase/migrations/20261104000000_catalog.sql`](./supabase/migrations/20261104000000_catalog.sql). Confirm it succeeds before deploying; the app depends on these tables.
3. Configure all required environment variables above in Vercel project settings for each intended environment. Set `DATABASE_URL` to the Supabase transaction-pooler URI with TLS (`sslmode=require`), and set the service-role key only as a server-side secret. For local setup, copy `.env.example` to `.env` and fill it in locally; `.env` is ignored by git.
4. Choose whether to import the checked-in `data/store.json`. Inspect the destination first. The importer overwrites matching category/product IDs and the website settings, so do not run it against an existing catalog unless that overwrite is intended. Run `npm run migrate:json` only with the selected environment's credentials.
5. Configure Supabase Storage CORS for the site origins that will perform admin uploads. Keep the catalog bucket public for customer-visible images.
6. Deploy to Vercel and verify `/api/health`, `/api/catalog`, and `/admin`. Run `npm run test:integration` against staging—not production—if exercising CRUD.
7. Confirm Supabase database backups and a separate Storage object backup/export plan. Database backups do not include Storage object bytes.

If a deployment agent does not have project access, stop after preparing the code and report which project access or secret configuration the owner must provide. Do not paste credentials into chat, commit them, or claim the app is connected until checks pass.

Admin image uploads request short-lived signed URLs from the app and then transfer the image directly from the browser to Supabase Storage. This avoids buffering large uploads in a Vercel function. Configure Supabase Storage CORS to allow the production site and any local/staging origins used for administration. Keep the bucket public for customer-visible images; only the backend service-role credential can create uploads.

## Verification and operations

- `npm test` runs validation and local helper tests without a live database.
- `npm run test:integration` exercises login, catalog create/update/delete, and authorization against a **staging** deployment. Set `TEST_BASE_URL` and `TEST_ADMIN_PASSWORD` first; it creates and removes temporary catalog records.
- `BASE_URL=https://your-domain.example npm run smoke` checks the deployed health endpoint and catalog response.
- Configure Vercel uptime monitoring against `/api/health`. Application errors are emitted as structured log entries with request IDs; use Vercel Function Logs and Supabase database/storage monitoring and alerts.
- Enable Supabase scheduled backups and, if the project plan supports it, point-in-time recovery. Periodically test restoring a backup to a separate project; keep the JSON source and any required exports in protected storage.
- Postgres backups do not back up Storage object bytes. Set up a separate bucket export or replication process and test restoring those images as well.
- Use a separate Supabase project and credentials for preview/staging. Rotate the service-role key, admin password, and session secret through deployment environment settings when staff access changes or a credential may have been exposed.

## Data model

- `catalog_settings`: single website/business configuration row.
- `categories`: ordered catalog categories.
- `products`: product details and ordered image URL array; deleting a category cascades to its products.
- `user_sessions`: server-side Express sessions.
- `auth_login_attempts`: hashed-IP login attempt windows used to rate-limit sign-in across instances.
