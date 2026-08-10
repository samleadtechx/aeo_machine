-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BlogStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "DomainMode" AS ENUM ('SUBFOLDER', 'SUBDOMAIN_ROOT');

-- CreateEnum
CREATE TYPE "DeploymentType" AS ENUM ('SFTP', 'FTP', 'FTPS');

-- CreateEnum
CREATE TYPE "CleanUrlMode" AS ENUM ('HTML', 'HTACCESS_DIRECTORY');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ArticleSource" AS ENUM ('MANUAL', 'BABYLOVEGROWTH', 'MCP', 'IMPORT');

-- CreateEnum
CREATE TYPE "SeoGateStatus" AS ENUM ('PASS', 'FAIL', 'WARNING');

-- CreateEnum
CREATE TYPE "FunnelType" AS ENUM ('QUIZ_2_OPTION_CALCULATOR');

-- CreateEnum
CREATE TYPE "FunnelStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlacementMatchMode" AS ENUM ('ANY_TAG', 'ALL_TAGS');

-- CreateEnum
CREATE TYPE "FunnelPlacement" AS ENUM ('AFTER_INTRO', 'MIDDLE', 'BEFORE_CONCLUSION', 'END');

-- CreateEnum
CREATE TYPE "LeadQualifiedStatus" AS ENUM ('UNKNOWN', 'QUALIFIED', 'UNQUALIFIED');

-- CreateEnum
CREATE TYPE "TrackingProvider" AS ENUM ('META', 'TIKTOK', 'REDDIT', 'OPENAI_ADS');

-- CreateEnum
CREATE TYPE "TrackingEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutboundWebhookMethod" AS ENUM ('POST', 'PUT', 'PATCH');

-- CreateEnum
CREATE TYPE "OutboundDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "BuildReason" AS ENUM ('MANUAL', 'ARTICLE_PUBLISH', 'FUNNEL_UPDATE', 'SETTINGS_UPDATE');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('BABYLOVEGROWTH', 'META', 'TIKTOK', 'REDDIT', 'OPENAI_ADS');

-- CreateEnum
CREATE TYPE "PublicWebhookType" AS ENUM ('LEAD_INGEST', 'TRACKING_EVENT', 'BABYLOVEGROWTH');

-- CreateEnum
CREATE TYPE "SeoIssueSeverity" AS ENUM ('BLOCKER', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "BlogStatus" NOT NULL DEFAULT 'ACTIVE',
    "baseUrl" TEXT NOT NULL,
    "domainMode" "DomainMode" NOT NULL DEFAULT 'SUBFOLDER',
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "brandName" TEXT NOT NULL,
    "logoMediaId" TEXT,
    "faviconMediaId" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "accentColor" TEXT NOT NULL DEFAULT '#0f766e',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter, ui-sans-serif, system-ui',
    "defaultAuthorName" TEXT NOT NULL DEFAULT 'Editorial Team',
    "defaultAuthorBio" TEXT,
    "organizationName" TEXT,
    "organizationLogoMediaId" TEXT,
    "robotsPolicy" TEXT NOT NULL DEFAULT 'index,follow',
    "indexNowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "indexNowKey" TEXT,
    "themeKey" TEXT NOT NULL DEFAULT 'default-saas-blog',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentTarget" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "type" "DeploymentType" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT,
    "privateKeyEncrypted" TEXT,
    "privateKeyPassphraseEncrypted" TEXT,
    "remoteRootPath" TEXT NOT NULL,
    "cleanUrlMode" "CleanUrlMode" NOT NULL DEFAULT 'HTACCESS_DIRECTORY',
    "phpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "htaccessEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ArticleSource" NOT NULL DEFAULT 'MANUAL',
    "sourceExternalId" TEXT,
    "markdown" TEXT NOT NULL,
    "htmlCache" TEXT,
    "excerpt" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "heroMediaId" TEXT,
    "heroAlt" TEXT,
    "authorName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seoScore" INTEGER NOT NULL DEFAULT 0,
    "seoGateStatus" "SeoGateStatus" NOT NULL DEFAULT 'FAIL',
    "seoGateDetailsJson" JSONB,
    "schemaJson" JSONB,
    "faqJson" JSONB,
    "noindex" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTag" (
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "blogId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storagePath" TEXT NOT NULL,
    "publicPath" TEXT NOT NULL,
    "altText" TEXT,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funnel" (
    "id" TEXT NOT NULL,
    "blogId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "FunnelType" NOT NULL DEFAULT 'QUIZ_2_OPTION_CALCULATOR',
    "status" "FunnelStatus" NOT NULL DEFAULT 'DRAFT',
    "configJson" JSONB NOT NULL,
    "styleJson" JSONB,
    "trackingJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Funnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelPlacementRule" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "matchMode" "PlacementMatchMode" NOT NULL DEFAULT 'ANY_TAG',
    "tagSlugsJson" JSONB NOT NULL,
    "placement" "FunnelPlacement" NOT NULL DEFAULT 'END',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelPlacementRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "funnelId" TEXT,
    "articleId" TEXT,
    "remoteSubmissionId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "fieldsJson" JSONB,
    "answersJson" JSONB,
    "resultJson" JSONB,
    "resultText" TEXT,
    "utmJson" JSONB,
    "trackingJson" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "sourceUrl" TEXT,
    "eventId" TEXT,
    "qualifiedStatus" "LeadQualifiedStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "leadId" TEXT,
    "provider" "TrackingProvider" NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "payloadJson" JSONB NOT NULL,
    "status" "TrackingEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundWebhook" (
    "id" TEXT NOT NULL,
    "blogId" TEXT,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "urlEncrypted" TEXT NOT NULL,
    "method" "OutboundWebhookMethod" NOT NULL DEFAULT 'POST',
    "headersEncryptedJson" TEXT,
    "secretEncrypted" TEXT,
    "eventTypesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundWebhookDelivery" (
    "id" TEXT NOT NULL,
    "outboundWebhookId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "OutboundDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestJson" JSONB,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboundWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'QUEUED',
    "reason" "BuildReason" NOT NULL DEFAULT 'MANUAL',
    "outputPath" TEXT,
    "manifestJson" JSONB,
    "fileCount" INTEGER,
    "sizeBytes" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'QUEUED',
    "uploadedFiles" INTEGER NOT NULL DEFAULT 0,
    "deletedFiles" INTEGER NOT NULL DEFAULT 0,
    "skippedFiles" INTEGER NOT NULL DEFAULT 0,
    "logJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "blogId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "secretsEncryptedJson" TEXT,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BabyLoveGrowthImport" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "externalArticleId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "articleId" TEXT,
    "rawPayloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BabyLoveGrowthImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "type" "PublicWebhookType" NOT NULL,
    "publicId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "blogScopeJson" JSONB,
    "permissionsJson" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAuditIssue" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "severity" "SeoIssueSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoAuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payloadJson" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Blog_slug_key" ON "Blog"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Blog_baseUrl_key" ON "Blog"("baseUrl");

-- CreateIndex
CREATE INDEX "DeploymentTarget_blogId_idx" ON "DeploymentTarget"("blogId");

-- CreateIndex
CREATE INDEX "Article_blogId_status_idx" ON "Article"("blogId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Article_blogId_slug_key" ON "Article"("blogId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Article_source_sourceExternalId_key" ON "Article"("source", "sourceExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_blogId_slug_key" ON "Tag"("blogId", "slug");

-- CreateIndex
CREATE INDEX "MediaAsset_blogId_idx" ON "MediaAsset"("blogId");

-- CreateIndex
CREATE INDEX "MediaAsset_hash_idx" ON "MediaAsset"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Funnel_blogId_slug_key" ON "Funnel"("blogId", "slug");

-- CreateIndex
CREATE INDEX "FunnelPlacementRule_blogId_idx" ON "FunnelPlacementRule"("blogId");

-- CreateIndex
CREATE INDEX "FunnelPlacementRule_funnelId_idx" ON "FunnelPlacementRule"("funnelId");

-- CreateIndex
CREATE INDEX "Lead_blogId_idx" ON "Lead"("blogId");

-- CreateIndex
CREATE INDEX "Lead_funnelId_idx" ON "Lead"("funnelId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_blogId_remoteSubmissionId_key" ON "Lead"("blogId", "remoteSubmissionId");

-- CreateIndex
CREATE INDEX "TrackingEvent_status_idx" ON "TrackingEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingEvent_provider_eventId_eventName_key" ON "TrackingEvent"("provider", "eventId", "eventName");

-- CreateIndex
CREATE INDEX "OutboundWebhook_blogId_idx" ON "OutboundWebhook"("blogId");

-- CreateIndex
CREATE INDEX "OutboundWebhookDelivery_outboundWebhookId_leadId_idx" ON "OutboundWebhookDelivery"("outboundWebhookId", "leadId");

-- CreateIndex
CREATE INDEX "OutboundWebhookDelivery_status_createdAt_idx" ON "OutboundWebhookDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Build_blogId_idx" ON "Build"("blogId");

-- CreateIndex
CREATE INDEX "Deployment_blogId_idx" ON "Deployment"("blogId");

-- CreateIndex
CREATE INDEX "Deployment_buildId_idx" ON "Deployment"("buildId");

-- CreateIndex
CREATE INDEX "IntegrationCredential_blogId_idx" ON "IntegrationCredential"("blogId");

-- CreateIndex
CREATE UNIQUE INDEX "BabyLoveGrowthImport_blogId_externalArticleId_key" ON "BabyLoveGrowthImport"("blogId", "externalArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicWebhookEndpoint_publicId_key" ON "PublicWebhookEndpoint"("publicId");

-- CreateIndex
CREATE INDEX "PublicWebhookEndpoint_blogId_idx" ON "PublicWebhookEndpoint"("blogId");

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "DeploymentTarget" ADD CONSTRAINT "DeploymentTarget_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funnel" ADD CONSTRAINT "Funnel_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelPlacementRule" ADD CONSTRAINT "FunnelPlacementRule_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelPlacementRule" ADD CONSTRAINT "FunnelPlacementRule_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundWebhook" ADD CONSTRAINT "OutboundWebhook_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundWebhookDelivery" ADD CONSTRAINT "OutboundWebhookDelivery_outboundWebhookId_fkey" FOREIGN KEY ("outboundWebhookId") REFERENCES "OutboundWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundWebhookDelivery" ADD CONSTRAINT "OutboundWebhookDelivery_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "DeploymentTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BabyLoveGrowthImport" ADD CONSTRAINT "BabyLoveGrowthImport_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BabyLoveGrowthImport" ADD CONSTRAINT "BabyLoveGrowthImport_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicWebhookEndpoint" ADD CONSTRAINT "PublicWebhookEndpoint_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAuditIssue" ADD CONSTRAINT "SeoAuditIssue_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

