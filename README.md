# AEO Machine

AEO Machine is a Next.js, Prisma, and PostgreSQL admin app for controlling static micro-blogs, article publishing gates, quiz-style lead funnels, remote PHP lead handoff, and SFTP/FTP deployments.

## Quick Start

1. Start Postgres:

```bash
docker compose up -d
```

2. Install dependencies and prepare the database:

```bash
npm install
npm run prisma:push
npm run seed
```

3. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000` and log in with the admin credentials from `.env`.

## Useful Scripts

- `npm run dev` starts the Next.js app.
- `npm run worker` starts the PostgreSQL-backed worker loop.
- `npm run build` generates Prisma Client and builds the Next app.
- `npm test` runs focused unit tests.

## Current V1 Coverage

- Single-admin login with Argon2id password hashes and HTTP-only sessions.
- Blog, article, funnel, lead, build, deployment, integration, MCP, and job schema.
- Admin dashboard and operational sections.
- Markdown editor plus rendered preview.
- SEO/AEO publishing gate with persisted audit issues.
- Static renderer for index, article, tag, sitemap, RSS, robots, `.htaccess`, funnel pages, and PHP webhook endpoints.
- Signed lead and tracking event webhook ingestion.
- Per-blog outbound lead webhook destinations with encrypted URLs, headers, signing secrets, test send, and queued delivery.
- SFTP/FTP/FTPS deployment adapters.
- BabyLoveGrowth bearer-auth webhook draft import endpoint.
- MCP-style JSON endpoint for read, article draft, and funnel control tools.

Production hardening still needs real credential entry UX, fuller provider adapters beyond Meta, richer media uploads, and provider-specific integration QA.
