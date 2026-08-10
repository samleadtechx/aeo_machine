# Coolify Deployment

Use the Dockerfile build pack for this app.

## App Service

- Repository: `https://github.com/samleadtechx/aeo_machine.git`
- Branch: `main`
- Build pack: Dockerfile
- Dockerfile path: `Dockerfile`
- Port: `3000`
- Health check path: `/api/health`
- Persistent storage mount path: `/app/storage`

The app writes all uploaded media, rendered static builds, and temporary files under `STORAGE_DIR`. In Coolify, create persistent storage for the app service and mount it at:

```text
/app/storage
```

Inside that volume the app uses:

```text
/app/storage/media
/app/storage/builds
/app/storage/tmp
```

## Required Environment Variables

Use production values in Coolify:

```bash
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
APP_URL=https://your-admin-domain.example.com
PUBLIC_WEBHOOK_BASE_URL=https://your-admin-domain.example.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
STORAGE_DIR=/app/storage

SESSION_SECRET=replace-with-strong-random-secret
APP_ENCRYPTION_KEY=replace-with-base64-32-byte-key
PUBLIC_WEBHOOK_SECRET=replace-with-strong-random-secret

ADMIN_EMAIL=admin@example.com
ADMIN_NAME=Admin
ADMIN_PASSWORD=replace-with-real-password

RUN_DB_MIGRATIONS=true
MIGRATION_MAX_ATTEMPTS=20
BOOTSTRAP_ADMIN=true
```

Generate secrets locally with:

```bash
openssl rand -base64 32
```

`APP_ENCRYPTION_KEY` must be exactly 32 random bytes encoded as base64, so the command above is the right shape for it.

## Database

Create a PostgreSQL database in Coolify, then copy its internal connection string into `DATABASE_URL`.

On startup, the container runs:

```bash
npm run prisma:migrate:deploy
npm run admin:bootstrap
```

The admin bootstrap creates the first admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. It does not seed demo blogs or articles.

## Optional Worker Service

For queued lead webhook delivery retries and background jobs, add a second Coolify service from the same repository/image with the command:

```bash
npm run worker
```

Use the same `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `PUBLIC_WEBHOOK_SECRET`, and `STORAGE_DIR` values. Mount the same persistent storage path, `/app/storage`.

For the worker service, set:

```bash
RUN_DB_MIGRATIONS=false
BOOTSTRAP_ADMIN=false
```

Let the web service handle migrations and admin bootstrap.
