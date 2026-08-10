# AEO Machine Technical Specification

Date: 2026-08-07

This document captures the full V1 product and engineering specification for the
micro-blog control system discussed in the Codex thread. It is intended to give a
development agent enough context to scaffold and build the first working app.

## 1. Product Summary

AEO Machine is a central control app for managing many independent micro-blogs
across different domains and hosting providers.

The central app runs on Node.js, Prisma, and PostgreSQL. It provides a polished
SaaS-style admin interface for one admin user to add blogs, write/edit/review
articles, generate static HTML sites, deploy those sites by SFTP/FTP, manage
quiz-style lead funnels, receive leads, import articles from BabyLoveGrowth, and
expose MCP tools for AI agents.

The public blogs are static files on remote servers. The central app renders
HTML/CSS/JS/assets ahead of time, uploads the files to the remote host, and only
uses small generated PHP endpoints on the remote blog domain for lead submission
and server-side tracking handoff.

Core goal:

- Public blog pages must be extremely fast because they are static HTML.
- Every blog should appear technically independent from the visitor's browser.
- The main admin system controls content, builds, deployments, leads, and AI
  agent access.
- Articles should be optimized for SEO and AEO with valid metadata, structured
  data, sitemaps, internal links, and answer-friendly page structure.

Important SEO note:

- The app can optimize technical SEO/AEO strongly, but it must not promise
  guaranteed ranking speed or guaranteed inclusion in Google/Bing/AI answers.
  Avoid cloaking, doorway-page patterns, invalid schema, and deceptive SEO.

## 2. Confirmed Product Decisions

The following decisions are already confirmed:

- Admin app framework: Next.js on Node.js.
- Data layer: Prisma with PostgreSQL.
- Development database: Docker Compose should provide PostgreSQL.
- Production database: user will provide a PostgreSQL URL on deployment,
  likely through Coolify.
- Authentication: single admin user for V1.
- Remote deploy providers: SFTP and FTP only for V1.
- Remote hosts: assume `.htaccess` and PHP are available.
- Public blog URL modes:
  - subfolder mode: `domain.com/blog/article-slug.html`
  - subdomain/root mode: `blog.domain.com/article-slug.html`
- Clean URLs:
  - generate `.html` files
  - use `.htaccess` where supported so `/article-slug/` can resolve to
    `/article-slug.html`
- BabyLoveGrowth:
  - support API pull and webhook ingestion
  - imported articles always become drafts for review
  - never auto-publish BabyLoveGrowth content
- Article editor:
  - Markdown editor plus rendered preview
- Forms:
  - not only normal forms
  - V1 must support the quiz funnel style shown in `form_example/index.html`
  - 2-option image quiz, calculated result, final lead capture
- Funnel placement:
  - rule-based by article tags
  - placements: after intro, middle, before conclusion, end
- Leads:
  - form processor on the remote blog sends lead data to the main system by
    webhook
  - main system stores leads in PostgreSQL
  - main system can forward leads somewhere else by outbound webhook
  - no client-side direct post from public blog to main app domain
- Tracking:
  - per-blog tracking settings
  - Meta Pixel plus Meta CAPI with `event_id` deduplication
  - TikTok Pixel plus Events API deduplication
  - Reddit Pixel plus Conversions API deduplication
  - OpenAI Ads Pixel/Conversions API support as an optional provider
- MCP:
  - AI agents may create/update drafts
  - AI agents must not publish or deploy without admin approval
- Publishing gate:
  - do not publish if important SEO/AEO fields are missing
- Language:
  - English-only for V1
- Media:
  - uploaded images are stored locally by the app
  - renderer uploads needed media assets during build/deploy
- Theme:
  - V1 starts with one polished responsive blog theme
  - per-blog colors/logo/typography should make blogs feel distinct

## 3. Reference Files In Workspace

The workspace currently contains a reference funnel:

- `form_example/index.html`
- `form_example/privacy.html`
- `form_example/terms.html`
- `form_example/respective_style_files/*`

The important file is `form_example/index.html`. It contains the actual quiz
funnel behavior inline:

- full-page mobile-first quiz
- top and bottom progress bars
- logo/topbar
- intro/title block
- 4 questions
- 2 image cards per question
- back/restart controls
- calculated result page
- final email capture
- Meta Pixel and local `capi.php` image beacon
- tracking parameter propagation
- redirect after submit
- localStorage demo storage only

Do not copy the Rosie legal text as product legal content. Use the example only
as a behavior/design reference. V1 should generate per-blog legal pages or allow
the admin to set blog-specific policy URLs/text.

## 4. High-Level Architecture

```text
                              +----------------------+
                              |      Admin User      |
                              +----------+-----------+
                                         |
                                         v
                           +-------------+--------------+
                           | Next.js Admin/API App      |
                           | Node.js + Prisma           |
                           +------+------+--------------+
                                  |      |
                                  |      +----------------+
                                  v                       v
                         +--------+---------+    +--------+---------+
                         | PostgreSQL       |    | Local media/build|
                         | Prisma schema    |    | storage          |
                         +--------+---------+    +--------+---------+
                                  |
                                  v
                         +--------+---------+
                         | Background Worker|
                         | build/deploy/sync|
                         +--------+---------+
                                  |
                  +---------------+----------------+
                  |                                |
                  v                                v
        +---------+----------+          +----------+---------+
        | Remote Blog A      |          | Remote Blog B      |
        | static HTML/assets |          | static HTML/assets |
        | PHP form endpoints |          | PHP form endpoints |
        +---------+----------+          +----------+---------+
                  |                                |
                  | same-domain submit/tracking    |
                  v                                v
        +---------+--------------------------------+---------+
        | Main app public webhooks                          |
        | leads, events, BabyLoveGrowth, outbound webhooks   |
        +---------------------------------------------------+
```

Use one deployable app service plus one worker process. In development the worker
can run as a second npm script. In production on Coolify, configure a second
process/service using the same image and environment variables.

## 5. Recommended Tech Stack

### Core

- Next.js App Router
- TypeScript
- Prisma
- PostgreSQL
- Zod for validation
- Argon2id for password hashing
- `jose` or `iron-session` for single-admin sessions
- Tailwind CSS
- shadcn/ui or equivalent accessible component primitives
- lucide-react for icons
- React Hook Form for admin forms

### Markdown and rendering

- `unified`
- `remark-parse`
- `remark-gfm`
- `remark-rehype`
- `rehype-slug`
- `rehype-autolink-headings`
- `rehype-stringify`
- `rehype-sanitize` for user-provided HTML safety

### Deployment

- SFTP: `ssh2-sftp-client`
- FTP/FTPS: `basic-ftp`
- Checksums/manifests for incremental upload

### Jobs

Use a PostgreSQL-backed job table for V1 instead of requiring Redis. This keeps
the deployment simple for Coolify and matches the confirmed "PostgreSQL only"
development dependency.

Implementation options:

- Simple custom `Job` table polled by a worker.
- Or `pg-boss` if the developer prefers a proven Postgres-backed queue.

If using `pg-boss`, keep Prisma for product tables and configure `pg-boss` with
the same `DATABASE_URL`.

### MCP

Use the official Model Context Protocol TypeScript SDK.

MCP must be a separate transport/route from normal admin APIs. MCP tokens are
scoped and cannot publish/deploy in V1.

## 6. Repository Structure

Target structure:

```text
.
├── TECHNICAL_SPEC.md
├── README.md
├── docker-compose.yml
├── package.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
├── storage/
│   ├── media/
│   ├── builds/
│   └── tmp/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   ├── api/
│   │   └── login/
│   ├── components/
│   ├── lib/
│   │   ├── auth/
│   │   ├── crypto/
│   │   ├── prisma.ts
│   │   ├── validation/
│   │   └── utils/
│   ├── modules/
│   │   ├── articles/
│   │   ├── baby-love-growth/
│   │   ├── blogs/
│   │   ├── deployments/
│   │   ├── forms/
│   │   ├── leads/
│   │   ├── mcp/
│   │   ├── media/
│   │   ├── rendering/
│   │   ├── seo/
│   │   └── tracking/
│   ├── worker/
│   │   ├── index.ts
│   │   ├── handlers/
│   │   └── jobs.ts
│   └── generated/
│       └── remote-php-templates/
└── form_example/
```

The `storage/` directory should be gitignored except for `.gitkeep` files.

## 7. Environment Variables

Create `.env.example` with:

```bash
# App
APP_URL=http://localhost:3000
PUBLIC_WEBHOOK_BASE_URL=http://localhost:3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://aeo:aeo_password@localhost:5432/aeo_machine

# Auth
SESSION_SECRET=replace-with-strong-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-on-first-run

# Encryption
# 32 random bytes, base64 encoded. Used for remote credentials and API secrets.
APP_ENCRYPTION_KEY=replace-with-base64-32-byte-key

# Storage
STORAGE_DIR=./storage

# Worker
WORKER_POLL_INTERVAL_MS=2000

# Public webhook signing
PUBLIC_WEBHOOK_SECRET=replace-with-strong-secret
```

Use a first-run setup flow or seed script to create the single admin account.
Do not store plaintext passwords.

## 8. Docker Compose For Development

V1 development compose should include PostgreSQL:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: aeo
      POSTGRES_PASSWORD: aeo_password
      POSTGRES_DB: aeo_machine
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Redis is not required for V1 unless the developer explicitly chooses BullMQ.

## 9. Database Model

Use Prisma. Names below are conceptual and may be adjusted, but preserve the
relationships and behavior.

### User

Single-admin V1.

Fields:

- `id`
- `email`
- `passwordHash`
- `name`
- `createdAt`
- `updatedAt`

Indexes:

- unique `email`

### Blog

Represents one controlled blog/domain.

Fields:

- `id`
- `name`
- `slug`
- `status`: `ACTIVE`, `PAUSED`
- `baseUrl`: canonical public URL, for example `https://example.com/blog`
- `domainMode`: `SUBFOLDER`, `SUBDOMAIN_ROOT`
- `language`: default `en`
- `timezone`
- `brandName`
- `logoMediaId`
- `faviconMediaId`
- `primaryColor`
- `accentColor`
- `fontFamily`
- `defaultAuthorName`
- `defaultAuthorBio`
- `organizationName`
- `organizationLogoMediaId`
- `robotsPolicy`
- `indexNowEnabled`
- `indexNowKey`
- `themeKey`: default `default-saas-blog`
- `createdAt`
- `updatedAt`

Indexes:

- unique `slug`
- unique `baseUrl`

### DeploymentTarget

One blog can have one active target in V1.

Fields:

- `id`
- `blogId`
- `type`: `SFTP`, `FTP`, `FTPS`
- `host`
- `port`
- `username`
- `passwordEncrypted`
- `privateKeyEncrypted`
- `privateKeyPassphraseEncrypted`
- `remoteRootPath`
- `cleanUrlMode`: `HTML`, `HTACCESS_DIRECTORY`
- `phpEnabled`: true
- `htaccessEnabled`: true
- `lastTestedAt`
- `lastTestStatus`
- `createdAt`
- `updatedAt`

Security:

- Encrypt secrets using AES-256-GCM with `APP_ENCRYPTION_KEY`.
- Never log credentials.
- Mask credentials in UI and logs.

### Article

Fields:

- `id`
- `blogId`
- `title`
- `slug`
- `status`: `DRAFT`, `REVIEW`, `APPROVED`, `PUBLISHED`, `ARCHIVED`
- `source`: `MANUAL`, `BABYLOVEGROWTH`, `MCP`, `IMPORT`
- `sourceExternalId`
- `markdown`
- `htmlCache`
- `excerpt`
- `metaTitle`
- `metaDescription`
- `canonicalUrl`
- `heroMediaId`
- `heroAlt`
- `authorName`
- `publishedAt`
- `updatedAt`
- `createdAt`
- `seoScore`
- `seoGateStatus`: `PASS`, `FAIL`, `WARNING`
- `seoGateDetailsJson`
- `schemaJson`
- `faqJson`
- `noindex`

Indexes:

- unique `(blogId, slug)`
- `(blogId, status)`
- `(source, sourceExternalId)`

### Tag

Fields:

- `id`
- `blogId`
- `name`
- `slug`

Indexes:

- unique `(blogId, slug)`

### ArticleTag

Join table:

- `articleId`
- `tagId`

### MediaAsset

Fields:

- `id`
- `blogId` nullable for global assets
- `filename`
- `originalName`
- `mimeType`
- `sizeBytes`
- `width`
- `height`
- `storagePath`
- `publicPath`
- `altText`
- `hash`
- `createdAt`

Indexes:

- `blogId`
- unique `hash` optional

### Funnel

Represents a quiz/calculator funnel.

Fields:

- `id`
- `blogId` nullable if global template
- `name`
- `slug`
- `type`: `QUIZ_2_OPTION_CALCULATOR`
- `status`: `DRAFT`, `ACTIVE`, `ARCHIVED`
- `configJson`
- `styleJson`
- `trackingJson`
- `createdAt`
- `updatedAt`

Indexes:

- unique `(blogId, slug)`

### FunnelPlacementRule

Controls injection into articles by tags.

Fields:

- `id`
- `blogId`
- `funnelId`
- `name`
- `enabled`
- `matchMode`: `ANY_TAG`, `ALL_TAGS`
- `tagSlugsJson`
- `placement`: `AFTER_INTRO`, `MIDDLE`, `BEFORE_CONCLUSION`, `END`
- `priority`
- `createdAt`
- `updatedAt`

### Lead

Stores received leads from remote blog PHP processors.

Fields:

- `id`
- `blogId`
- `funnelId`
- `articleId` nullable
- `remoteSubmissionId`
- `email`
- `phone`
- `name`
- `fieldsJson`
- `answersJson`
- `resultJson`
- `resultText`
- `utmJson`
- `trackingJson`
- `ipHash`
- `userAgent`
- `referrer`
- `sourceUrl`
- `eventId`
- `qualifiedStatus`: `UNKNOWN`, `QUALIFIED`, `UNQUALIFIED`
- `createdAt`

Indexes:

- `blogId`
- `funnelId`
- `createdAt`
- unique `(blogId, remoteSubmissionId)`

Privacy:

- Store raw contact details because this is a lead system.
- Hash IP address with an app secret if IP is retained.
- Add delete/export functions later if required.

### TrackingEvent

Stores server-side conversion events and delivery state.

Fields:

- `id`
- `blogId`
- `leadId` nullable
- `provider`: `META`, `TIKTOK`, `REDDIT`, `OPENAI_ADS`
- `eventName`
- `eventId`
- `eventTime`
- `sourceUrl`
- `payloadJson`
- `status`: `PENDING`, `SENT`, `FAILED`, `SKIPPED`
- `attempts`
- `lastError`
- `createdAt`
- `sentAt`

Indexes:

- unique `(provider, eventId, eventName)`
- `status`

### OutboundWebhook

Config for forwarding leads elsewhere.

Fields:

- `id`
- `blogId` nullable
- `name`
- `enabled`
- `urlEncrypted`
- `method`: default `POST`
- `headersEncryptedJson`
- `secretEncrypted`
- `eventTypesJson`
- `createdAt`
- `updatedAt`

### OutboundWebhookDelivery

Fields:

- `id`
- `outboundWebhookId`
- `leadId`
- `status`: `PENDING`, `SENT`, `FAILED`
- `attempts`
- `requestJson`
- `responseStatus`
- `responseBody`
- `lastError`
- `createdAt`
- `sentAt`

### Build

Fields:

- `id`
- `blogId`
- `status`: `QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`
- `reason`: `MANUAL`, `ARTICLE_PUBLISH`, `FUNNEL_UPDATE`, `SETTINGS_UPDATE`
- `outputPath`
- `manifestJson`
- `fileCount`
- `sizeBytes`
- `startedAt`
- `completedAt`
- `error`
- `createdAt`

### Deployment

Fields:

- `id`
- `blogId`
- `buildId`
- `targetId`
- `status`: `QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`, `ROLLED_BACK`
- `uploadedFiles`
- `deletedFiles`
- `skippedFiles`
- `logJson`
- `startedAt`
- `completedAt`
- `error`
- `createdAt`

### IntegrationCredential

Stores API credentials for BabyLoveGrowth and ad providers.

Fields:

- `id`
- `blogId` nullable
- `provider`: `BABYLOVEGROWTH`, `META`, `TIKTOK`, `REDDIT`, `OPENAI_ADS`
- `name`
- `enabled`
- `secretsEncryptedJson`
- `settingsJson`
- `createdAt`
- `updatedAt`

### BabyLoveGrowthImport

Fields:

- `id`
- `blogId`
- `externalArticleId`
- `status`: `IMPORTED`, `SKIPPED`, `FAILED`
- `articleId`
- `rawPayloadJson`
- `createdAt`

Indexes:

- unique `(blogId, externalArticleId)`

### PublicWebhookEndpoint

Blog-specific public webhook secrets for remote PHP processors and integrations.

Fields:

- `id`
- `blogId`
- `type`: `LEAD_INGEST`, `TRACKING_EVENT`, `BABYLOVEGROWTH`
- `publicId`
- `secretEncrypted`
- `enabled`
- `createdAt`
- `updatedAt`

### McpToken

Fields:

- `id`
- `name`
- `tokenHash`
- `enabled`
- `blogScopeJson`
- `permissionsJson`
- `lastUsedAt`
- `createdAt`
- `updatedAt`

V1 permissions:

- `blogs.read`
- `articles.read`
- `articles.create_draft`
- `articles.update_draft`
- `forms.read`
- `leads.read_summary`

Do not include publish/deploy permissions in V1.

### SeoAuditIssue

Fields:

- `id`
- `articleId`
- `severity`: `BLOCKER`, `WARNING`, `INFO`
- `code`
- `message`
- `detailsJson`
- `createdAt`

### Job

If using a custom DB job queue:

- `id`
- `type`
- `status`: `QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`
- `payloadJson`
- `attempts`
- `maxAttempts`
- `runAfter`
- `lockedAt`
- `lockedBy`
- `lastError`
- `createdAt`
- `updatedAt`

## 10. Admin UI Specification

The admin interface should be polished, SaaS-style, and mobile-oriented.

Do not create a marketing landing page. The first screen after login should be
the operational dashboard.

### Navigation

Desktop:

- left sidebar
- top bar with current blog selector and status

Mobile:

- bottom navigation or compact top navigation
- primary actions easy to reach
- article editor usable on mobile, though desktop can be better for long edits

Main sections:

- Dashboard
- Blogs
- Articles
- Funnels
- Leads
- Deployments
- Integrations
- MCP
- Settings

### Dashboard

Show:

- total blogs
- published articles
- drafts needing review
- failed SEO gates
- recent leads
- recent deployments
- integration errors
- quick action: New Article
- quick action: New Blog
- quick action: New Funnel

### Blog Manager

Create/edit:

- blog name
- base URL
- domain mode: subfolder or subdomain/root
- deployment target
- brand settings
- author/org settings
- theme colors
- tracking provider settings
- SEO defaults

Actions:

- test SFTP/FTP connection
- preview site build
- build now
- deploy now
- view generated sitemap

### Article Manager

Views:

- all articles
- drafts
- review
- approved
- published
- SEO blockers
- imported from BabyLoveGrowth
- created by MCP

Editor:

- Markdown editor on one side
- rendered preview
- SEO panel
- schema preview
- funnel placement preview
- hero image upload/select
- tags/categories
- publish gate checklist

Publishing:

- `Save Draft`
- `Request Review`
- `Approve`
- `Publish`
- `Unpublish`

MCP-created and BabyLoveGrowth-imported content should clearly show its source.

### Funnel Manager

V1 funnel type:

- 2-option image quiz calculator

Admin fields:

- funnel name
- slug
- status
- logo
- accent color
- intro kicker
- intro title
- intro subtitle
- start button label
- questions
- answer options
- answer images
- result formula/rules
- final lead fields
- submit button label
- thank-you or redirect action
- placement rules
- tracking settings

The UI should support drag/reorder questions.

### Leads

Show:

- lead details
- blog
- funnel
- article/source URL
- answers
- result
- contact fields
- tracking/event IDs
- outbound webhook delivery status

Actions:

- mark qualified/unqualified
- resend outbound webhooks
- export CSV

### Deployments

Show:

- builds
- deployments
- logs
- uploaded/changed/deleted files
- errors

Actions:

- deploy latest successful build
- retry failed deploy
- rollback by redeploying previous successful build where possible

## 11. Article URL Rules

For subfolder mode:

```text
baseUrl: https://example.com/blog
article canonical: https://example.com/blog/article-slug/
physical file: /blog/article-slug.html
```

For subdomain/root mode:

```text
baseUrl: https://blog.example.com
article canonical: https://blog.example.com/article-slug/
physical file: /article-slug.html
```

If `.htaccess` clean URLs are disabled:

```text
canonical: https://example.com/blog/article-slug.html
```

But V1 can assume `.htaccess` is supported.

## 12. Static Rendering Specification

The renderer takes one blog and all publishable content, then writes a complete
static site folder.

Generate:

- `index.html`
- article pages
- tag pages
- category pages if categories are added
- `sitemap.xml`
- `robots.txt`
- `rss.xml`
- `.htaccess`
- copied/optimized media assets
- copied funnel assets
- generated PHP submit/event endpoints

### Article HTML Requirements

Each article page must include:

- `<!doctype html>`
- correct `lang="en"`
- one `h1`
- canonical tag
- meta title
- meta description
- Open Graph tags
- Twitter card tags
- article published/modified metadata
- author metadata
- JSON-LD `BlogPosting` or `Article`
- Breadcrumb JSON-LD
- FAQ JSON-LD only when real FAQ content exists
- responsive CSS
- optimized hero image with alt text
- internal related links
- clear date/author area
- article body from Markdown
- injected funnel if placement rules match

### AEO Content Structure

For answer-engine friendliness, support optional article fields:

- direct answer summary
- key takeaways
- FAQ
- definitions
- comparison tables
- cited sources

Do not add schema for content that is not visibly present on the page.

### SEO Publishing Gate

Do not allow publish if any blocker exists:

- missing title
- missing slug
- duplicate slug within blog
- missing meta title
- missing meta description
- meta description too short or too long outside configured bounds
- missing canonical URL
- missing H1
- missing body content
- missing hero image alt text if hero image exists
- invalid JSON-LD
- missing author
- missing tags
- broken internal links in article body
- no generated sitemap entry

Warnings should not block unless configured later:

- body is thin
- no FAQ
- no internal related links
- title too similar to another article
- image too large
- no outbound citations for factual/statistical article

## 13. Funnel Forms Specification

The form system is a distributed funnel engine, not just normal HTML forms.

### V1 Funnel Type

`QUIZ_2_OPTION_CALCULATOR`

Behavior based on `form_example/index.html`:

- top/bottom progress bars
- intro/title block
- 2 image answer cards per question
- click/tap answer advances automatically
- back and restart actions
- result screen
- calculated result
- lead capture after result
- browser pixel event and same-domain PHP tracking handoff
- lead submit to same-domain PHP endpoint
- optional redirect after submit

### Funnel Config Shape

Example:

```json
{
  "intro": {
    "kicker": "Plumbing Call Leak Calculator",
    "title": "Check how many extra plumbing jobs you could book.",
    "subtitle": "Answer 4 quick questions and get an estimate.",
    "startButton": "Start"
  },
  "questions": [
    {
      "id": "owner",
      "kicker": "Authority gate",
      "title": "Do you own a plumbing business?",
      "subtitle": "This is built for owners and decision-makers.",
      "options": [
        {
          "label": "Yes, I am the owner",
          "value": "owner",
          "imageMediaId": "media-id"
        },
        {
          "label": "No, I am not the owner",
          "value": "not_owner",
          "imageMediaId": "media-id"
        }
      ]
    }
  ],
  "result": {
    "type": "formula",
    "formulaKey": "missed_call_loss_v1",
    "currency": "USD",
    "copyRules": []
  },
  "leadFields": [
    { "name": "email", "type": "email", "required": true },
    { "name": "phone", "type": "tel", "required": false },
    { "name": "name", "type": "text", "required": false }
  ],
  "submit": {
    "buttonLabel": "Get my result",
    "successMode": "redirect",
    "redirectUrl": "https://example.com/thank-you/"
  }
}
```

### Result Formula V1

Implement a simple configurable formula engine. For the first formula, port the
example's missed-call loss calculation as a named formula:

`missed_call_loss_v1`

Inputs:

- owner answer
- missed calls answer
- value answer
- wants answer

Defaults:

- missed calls per week: `6` if regular misses, otherwise `1`
- high value per missed call: `450`
- low value per missed call: `300`
- loss factor: `0.60`
- subscription comparison amount: configurable, default `49`

Output:

- weekly estimated loss
- monthly estimated loss
- human-readable result text
- bullet list
- qualification metadata

The formula constants should be editable in admin for each funnel.

### Funnel Placement

Funnels are injected into articles by tag rules.

Placement values:

- `AFTER_INTRO`: after first paragraph or after configured intro block
- `MIDDLE`: approximately halfway through the article at a paragraph boundary
- `BEFORE_CONCLUSION`: before final section or final 20 percent
- `END`: after article body

If multiple rules match, use lowest numeric `priority` first.

### Generated Remote Files

For each blog with funnels, generate files like:

```text
/forms/plumbing-call-leak.html
/forms/plumbing-call-leak-submit.php
/track/collect.php
/assets/funnels/plumbing-call-leak/*
/.htaccess
```

If the funnel is only embedded in articles, a standalone form page is still
useful for preview/testing but should default to `noindex`.

### Same-Domain Submit Flow

The browser must submit to the public blog domain:

```text
visitor browser
  -> https://public-blog.com/forms/plumbing-call-leak-submit.html
  -> .htaccess rewrite to plumbing-call-leak-submit.php
  -> PHP signs payload
  -> PHP sends server-to-server POST to main app webhook
  -> main app stores lead
  -> main app queues CAPI/conversion events and outbound webhooks
```

The visitor browser must not directly post to the main app domain.

### PHP Submit Handler

The generated PHP handler must:

- accept only POST
- validate a generated form token
- validate required fields
- reject honeypot field if filled
- reject too-fast submissions based on a timestamp hidden field
- generate or preserve `remoteSubmissionId`
- include `event_id` from browser when present
- include UTM params, referrer, current URL, user agent
- HMAC sign payload using a per-blog webhook secret
- POST JSON to main app public lead webhook
- return JSON or redirect according to funnel config
- never expose webhook secret to browser

Optional fallback:

- if main app webhook is unavailable, write JSONL locally to a protected folder
  and retry later only if a cron/remote mechanism is added. This fallback is
  optional for V1 because confirmed primary behavior is direct webhook.

### `.htaccess` Requirements

Generated `.htaccess` should support:

```apache
Options -Indexes
RewriteEngine On

# Clean article URLs: /slug/ -> /slug.html
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.+)/?$ $1.html [L]

# Hide PHP behind .html-looking submit URLs
RewriteRule ^forms/([a-z0-9-]+)-submit\.html$ forms/$1-submit.php [L,QSA]
RewriteRule ^track/collect\.html$ track/collect.php [L,QSA]

# Protect private files
<FilesMatch "\.(jsonl|log|env|secret)$">
  Require all denied
</FilesMatch>
```

Adjust syntax if the target host uses older Apache rules.

## 14. Lead Webhook Ingestion

Main app endpoint:

```text
POST /api/public/blog-webhooks/:publicId/leads
```

Headers:

```text
X-AEO-Timestamp: unix timestamp
X-AEO-Signature: hex hmac sha256
Content-Type: application/json
```

Signature:

```text
hmac_sha256(secret, timestamp + "." + rawBody)
```

Validation:

- lookup `PublicWebhookEndpoint` by `publicId`
- reject disabled endpoints
- reject timestamp older than 5 minutes
- compare HMAC in constant time
- dedupe by `(blogId, remoteSubmissionId)`

Response:

```json
{ "ok": true, "leadId": "..." }
```

Do not return internal errors or secrets.

## 15. Tracking and CAPI Specification

Tracking is per blog and per provider. Browser pixels are fired on the public
blog domain. Server-side conversion events are sent by the main app after
receiving a same-domain PHP event/lead webhook.

### Supported Providers

V1 provider adapters:

- Meta
- TikTok
- Reddit
- OpenAI Ads

As of 2026-08-07, official docs exist for:

- Meta Pixel and Conversions API deduplication using matching Pixel `eventID`
  and CAPI `event_id`.
- TikTok Pixel and Events API deduplication using `event_id`.
- Reddit Pixel and Conversions API event deduplication.
- OpenAI Ads Pixel and Conversions API.

Sources are listed at the end of this document.

### Event ID Deduplication Rule

The browser must generate a unique event ID before firing any browser pixel. The
same ID must be passed to:

- browser pixel event
- same-domain PHP tracking/lead endpoint
- main app TrackingEvent
- provider CAPI request

For lead submit:

```text
eventName = Lead
eventId = generated client-side UUID
```

For page view/content events:

```text
eventName = PageView or ViewContent
eventId = generated client-side UUID
```

### Same-Domain Tracking Handoff

Generate a lightweight remote PHP endpoint:

```text
GET or POST /track/collect.html
```

The public page can call it using `navigator.sendBeacon`, `fetch` with
`keepalive`, or an image beacon fallback.

Payload should include:

- `event_name`
- `event_id`
- `source_url`
- `referrer`
- `user_agent`
- UTM params
- provider click IDs/cookies when available
- blog public ID
- optional funnel/article context

The PHP endpoint signs and forwards to:

```text
POST /api/public/blog-webhooks/:publicId/events
```

### Main App CAPI Worker

When a lead/event arrives:

1. Store raw event.
2. Create `TrackingEvent` rows for enabled providers.
3. Worker sends server-side conversion request.
4. Mark `SENT` or `FAILED`.
5. Retry failures with exponential backoff.

### Provider Config

Each blog should support:

Meta:

- pixel ID
- access token
- test event code
- enabled events

TikTok:

- pixel ID
- access token
- advertiser/account settings as required by current TikTok docs
- test mode fields if available

Reddit:

- pixel ID
- access token
- advertiser/account settings as required by current Reddit docs

OpenAI Ads:

- pixel/config ID or equivalent
- API key/access token
- advertiser/account settings as required by current OpenAI Ads docs

Provider payload implementations must be isolated behind adapter interfaces:

```ts
interface ConversionProvider {
  provider: "META" | "TIKTOK" | "REDDIT" | "OPENAI_ADS";
  buildBrowserSnippet(config: ProviderConfig): string;
  buildServerPayload(event: NormalizedTrackingEvent): unknown;
  send(event: NormalizedTrackingEvent): Promise<ProviderSendResult>;
}
```

Do not hardcode provider details into article templates.

### Privacy and Matching Data

When sending contact data to providers:

- normalize email/phone
- hash with SHA-256 where provider docs require or allow hashed PII
- never send fields disabled in blog tracking settings
- allow provider-level opt-out in admin

## 16. Outbound Lead Webhooks

The main app can forward stored leads to external systems.

Admin config:

- webhook name
- URL
- method
- custom headers
- signing secret
- enabled blogs
- event types

Default payload:

```json
{
  "event": "lead.created",
  "lead": {
    "id": "...",
    "blogId": "...",
    "funnelId": "...",
    "email": "...",
    "phone": "...",
    "name": "...",
    "answers": {},
    "result": {},
    "sourceUrl": "...",
    "createdAt": "..."
  }
}
```

Sign outbound payloads:

```text
X-AEO-Timestamp
X-AEO-Signature
```

Retry failures.

## 17. BabyLoveGrowth Integration

Support both:

- API pull
- webhook ingestion

User-provided docs:

- `https://www.babylovegrowth.ai/docs/integrations/api`
- `https://www.babylovegrowth.ai/docs/integrations/webhook`

Previous analysis of docs:

- API uses an API key header for fetching article summaries/full content.
- Webhooks send article JSON by POST and use bearer-token style authorization.
- Webhook should respond quickly with HTTP 200.
- Their docs warn against fetching from their API on every page view; store
  imported content locally instead.

Implementation:

### Credential

Store BabyLoveGrowth API key/token in `IntegrationCredential`.

### API Pull

Admin action:

- "Sync BabyLoveGrowth"

Worker job:

- fetch summaries
- fetch full article content
- dedupe by external article ID
- create `Article` with `status = DRAFT`
- source `BABYLOVEGROWTH`
- store raw payload in `BabyLoveGrowthImport`

### Webhook

Endpoint:

```text
POST /api/public/integrations/babylovegrowth/:publicId
```

Behavior:

- validate bearer token/secret
- store raw payload
- create draft article
- respond quickly
- queue enrichment/SEO audit job

Never auto-publish.

## 18. MCP Server Specification

MCP gives AI agents controlled access to the central system.

V1 rule:

- MCP can read blogs and create/update drafts.
- MCP cannot publish, approve, deploy, or change credentials.

### MCP Tools

`list_blogs`

- returns blogs scoped to token

`get_blog`

- returns blog details safe for content generation
- never returns deployment credentials or API tokens

`list_articles`

- filter by blog, status, source

`get_article`

- returns markdown, metadata, tags, SEO issues

`create_article_draft`

- creates a draft article
- requires blog ID, title, markdown
- optional tags, meta fields
- runs SEO audit

`update_article_draft`

- only updates articles not currently published unless explicit admin-created
  editable draft version is added later

`list_funnels`

- lets agents know which funnels exist for context

`get_funnel`

- returns one funnel, config JSON, style JSON, and placement rules

`create_funnel`

- creates a blog-scoped draft or active funnel
- accepts funnel config/style/tracking JSON

`update_funnel`

- updates safe funnel fields and JSON config

`set_funnel_status`

- changes funnel status between `DRAFT`, `ACTIVE`, and `ARCHIVED`

`archive_funnel`

- non-destructive removal from active use

`add_funnel_placement_rule`

- lets an agent place an existing funnel by article tag rules

`get_seo_requirements`

- returns current publish gate requirements

### MCP Auth

Use bearer tokens. Store only token hash.

Token config:

- blog scope
- allowed permissions
- enabled/disabled
- last used timestamp

MCP audit log should record:

- token ID
- tool name
- arguments summary
- result status
- created/updated records

## 19. Build and Deployment Workflow

### Build

Input:

- blog settings
- published articles
- active funnels
- active placement rules
- media assets
- tracking settings

Output:

- full static folder in `storage/builds/{blogId}/{buildId}`
- manifest with file paths, sizes, hashes

Build steps:

1. Validate blog settings.
2. Load publishable articles.
3. Run SEO gate for articles.
4. Fail build if any published article now has blockers.
5. Render article HTML.
6. Inject matching funnels.
7. Render index/tag pages.
8. Render legal pages if configured.
9. Render sitemap/rss/robots.
10. Render `.htaccess`.
11. Render PHP endpoints.
12. Copy/optimize assets.
13. Write manifest.

### Deploy

Input:

- successful build
- deployment target

Deploy steps:

1. Test connection.
2. Read previous deployed manifest if available.
3. Upload changed/new files.
4. Delete stale files only if safe and tracked by previous manifest.
5. Upload `.htaccess` near the end.
6. Upload manifest.
7. Record logs.

Atomic deploy:

- SFTP/FTP shared hosting may not support true atomic symlink swaps.
- V1 should use manifest-based incremental upload.
- If host supports staging folders and rename, use it as an optimization later.

Rollback:

- Redeploy a previous successful build.
- Do not rely on host snapshots.

## 20. Generated Blog Theme V1

One polished responsive theme.

Design goals:

- fast
- readable
- mobile-first
- restrained SaaS/editorial style
- not dominated by a single hue
- no decorative bloat
- article content first
- clear related links
- responsive lead funnel embedding

Per-blog customization:

- logo
- favicon
- primary color
- accent color
- font family
- author/org
- footer links
- tracking IDs
- endpoint slugs

To avoid every blog looking identical:

- self-host assets per blog
- vary colors/logos/brand settings
- allow custom CSS variables
- avoid a shared central CDN URL by default
- use same-domain PHP endpoints
- make endpoint slugs configurable where practical

Do not add deceptive cloaking or hidden content.

## 21. Security Requirements

### Admin

- single admin email/password
- Argon2id password hashing
- HTTP-only secure session cookie
- CSRF protection for mutations
- rate limit login attempts

### Secrets

- AES-256-GCM encryption for:
  - SFTP/FTP passwords
  - private keys
  - integration API keys
  - webhook secrets
  - outbound webhook headers

### Webhooks

- HMAC signatures
- timestamp replay protection
- deduplication
- raw body validation

### Remote PHP

- no secrets in JS
- only PHP sees webhook secret
- validate required fields
- honeypot
- minimum submit time
- optional denylist/rate limit by hashed IP
- no directory listing

### Rendering

- sanitize HTML generated from Markdown
- do not allow arbitrary admin-provided scripts in articles for V1, except
  controlled tracking snippets generated by provider adapters
- validate URLs
- escape all dynamic content in templates

## 22. API Routes

Suggested admin API routes:

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/blogs
POST   /api/blogs
GET    /api/blogs/:id
PATCH  /api/blogs/:id
POST   /api/blogs/:id/test-deployment
POST   /api/blogs/:id/build
POST   /api/blogs/:id/deploy

GET    /api/blogs/:blogId/articles
POST   /api/blogs/:blogId/articles
GET    /api/articles/:id
PATCH  /api/articles/:id
POST   /api/articles/:id/seo-audit
POST   /api/articles/:id/approve
POST   /api/articles/:id/publish
POST   /api/articles/:id/unpublish

GET    /api/blogs/:blogId/funnels
POST   /api/blogs/:blogId/funnels
GET    /api/funnels/:id
PATCH  /api/funnels/:id

GET    /api/blogs/:blogId/leads
GET    /api/leads/:id
POST   /api/leads/:id/resend-webhooks

GET    /api/blogs/:blogId/deployments
GET    /api/deployments/:id

GET    /api/integrations
POST   /api/integrations/babylovegrowth/sync

GET    /api/mcp/tokens
POST   /api/mcp/tokens
PATCH  /api/mcp/tokens/:id
DELETE /api/mcp/tokens/:id
```

Public routes:

```text
POST /api/public/blog-webhooks/:publicId/leads
POST /api/public/blog-webhooks/:publicId/events
POST /api/public/integrations/babylovegrowth/:publicId
```

MCP route:

```text
/api/mcp
```

Exact transport depends on the selected MCP SDK pattern.

## 23. Background Jobs

Job types:

- `BUILD_BLOG`
- `DEPLOY_BUILD`
- `BABYLOVEGROWTH_SYNC`
- `BABYLOVEGROWTH_PROCESS_WEBHOOK`
- `SEO_AUDIT_ARTICLE`
- `SEND_CONVERSION_EVENT`
- `SEND_OUTBOUND_WEBHOOK`
- `PROCESS_MEDIA`

Worker requirements:

- idempotent handlers
- retries with backoff
- job logs visible in admin
- never leak secrets in job logs

## 24. Media Handling

Uploads:

- validate MIME type
- max size config
- store in `storage/media/{blogId}/...`
- generate safe filenames
- store dimensions
- allow alt text

Rendering:

- copy referenced media to build folder
- use stable public paths
- optionally generate compressed variants later

V1 does not require advanced image CDN support.

## 25. Testing Requirements

Minimum tests:

- Prisma schema migrates
- auth login works
- credential encryption/decryption works
- SEO gate blocks missing required fields
- Markdown rendering creates valid HTML
- static build writes expected files
- `.htaccess` generated
- PHP submit template includes HMAC signing
- lead webhook verifies signature
- tracking event dedupe stores unique events
- MCP create draft cannot publish
- BabyLoveGrowth import creates draft

Useful integration tests:

- local build of demo blog
- deploy to local fake SFTP/FTP target or mocked client
- submit sample lead payload signed like remote PHP

## 26. Development Phases

### Phase 1: App Foundation

- scaffold Next.js/TypeScript/Prisma
- Docker Compose PostgreSQL
- auth
- admin shell UI
- Prisma schema
- seed admin

### Phase 2: Blogs, Articles, Renderer

- blog CRUD
- article CRUD
- markdown editor plus preview
- media upload
- SEO gate
- static renderer
- local build preview

### Phase 3: Deployment

- SFTP deploy adapter
- FTP/FTPS deploy adapter
- deployment target testing
- manifest-based upload
- deployment logs

### Phase 4: Funnel Forms and Leads

- funnel CRUD
- 2-option quiz builder
- funnel renderer
- article tag placement
- generated PHP submit endpoint
- lead webhook ingestion
- lead dashboard
- outbound webhook forwarding

### Phase 5: Tracking

- provider config UI
- browser snippets
- same-domain tracking PHP endpoint
- event ingestion
- CAPI worker adapters for Meta, TikTok, Reddit, OpenAI Ads
- event dedupe and delivery logs

### Phase 6: Integrations and MCP

- BabyLoveGrowth API pull
- BabyLoveGrowth webhook
- MCP server
- MCP token UI
- audit logs

## 27. V1 Definition Of Done

The first version is ready when:

- Admin can log in.
- Admin can create a blog.
- Admin can configure SFTP/FTP target and test it.
- Admin can upload media.
- Admin can create/edit an article in Markdown with preview.
- SEO gate blocks publish when required fields are missing.
- Admin can publish an article.
- App can build static files for one blog.
- App can deploy the generated files by SFTP/FTP.
- Clean URLs work through generated `.htaccess`.
- Admin can create a 2-option quiz funnel like `form_example`.
- Funnel can be injected into articles by tag and placement rule.
- Generated remote PHP submit handler posts leads to main app webhook.
- Leads appear in admin.
- Main app can forward leads by outbound webhook.
- Tracking event IDs are generated and reused for browser/server dedupe.
- Meta/TikTok/Reddit/OpenAI Ads provider adapters are structurally present,
  with at least Meta fully implemented first if time is limited.
- BabyLoveGrowth API/webhook imports articles as drafts.
- MCP can create/update drafts but cannot publish/deploy.

## 28. Explicit Non-Goals For V1

- Multi-user roles.
- Billing.
- Non-English content.
- Dynamic public blog runtime in Node.js.
- Full CMS theme marketplace.
- Advanced image CDN.
- Automatic rank guarantees.
- Auto-publish from BabyLoveGrowth or MCP.
- Remote database requirement on each blog host.
- Direct browser posts from public blogs to the main app domain.

## 29. Open Implementation Choices

These can be decided by the development agent unless the product owner gives a
new preference:

- Use custom Prisma `Job` table or `pg-boss`.
- Use CodeMirror, Monaco, or another Markdown editor.
- Use shadcn/ui or another Tailwind-compatible component library.
- Implement all CAPI providers in V1 or ship Meta first with adapter stubs for
  TikTok/Reddit/OpenAI Ads.

## 30. Source Links

BabyLoveGrowth:

- https://www.babylovegrowth.ai/docs/integrations/api

MCP:

- https://github.com/modelcontextprotocol/typescript-sdk

SEO and structured data:

- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/appearance/structured-data/article
- https://schema.org/BlogPosting
- https://www.indexnow.org/documentation

Ad tracking and conversion APIs:

- https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events
- https://ads.tiktok.com/help/article/event-deduplication
- https://ads.tiktok.com/help/article/events-api
- https://business.reddithelp.com/s/article/Conversions-API
- https://developers.openai.com/ads
- https://developers.openai.com/ads/conversions-api
