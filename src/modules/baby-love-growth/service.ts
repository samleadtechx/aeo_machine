import type { BabyLoveGrowthImport, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalArticleUrl } from "@/lib/utils/url";
import { ensureSlug } from "@/lib/utils/slugify";
import { createArticle, publishArticle } from "@/modules/articles/service";
import { deployBuild } from "@/modules/deployments/service";
import { buildBlogStaticSite } from "@/modules/rendering/site-renderer";

const SETTINGS_CREDENTIAL_NAME = "Webhook import settings";

type BabyLoveGrowthPayload = {
  id?: string | number;
  articleId?: string | number;
  title?: string;
  slug?: string;
  markdown?: string;
  content?: string;
  content_markdown?: string;
  content_html?: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  heroImageUrl?: string;
  publicUrl?: string;
  languageCode?: string;
  jsonLd?: unknown;
  faqJsonLd?: unknown;
  tags?: string[] | string;
};

type BabyLoveGrowthSettingsJson = {
  autoPublish: boolean;
  defaultTags: string[];
};

export type BabyLoveGrowthBlogSetting = {
  blogId: string;
  blogName: string;
  blogSlug: string;
  autoPublish: boolean;
  defaultTags: string[];
  enabled: boolean;
  updatedAt: Date | null;
};

export async function listBabyLoveGrowthSettings(): Promise<BabyLoveGrowthBlogSetting[]> {
  const [blogs, credentials] = await Promise.all([
    prisma.blog.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.integrationCredential.findMany({
      where: { provider: "BABYLOVEGROWTH", name: SETTINGS_CREDENTIAL_NAME },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const credentialByBlog = new Map<string, (typeof credentials)[number]>();
  for (const credential of credentials) {
    if (credential.blogId && !credentialByBlog.has(credential.blogId)) {
      credentialByBlog.set(credential.blogId, credential);
    }
  }

  return blogs.map((blog) => {
    const credential = credentialByBlog.get(blog.id);
    const settings = parseBabyLoveGrowthSettings(credential?.settingsJson);
    return {
      blogId: blog.id,
      blogName: blog.name,
      blogSlug: blog.slug,
      autoPublish: settings.autoPublish,
      defaultTags: settings.defaultTags,
      enabled: credential?.enabled ?? true,
      updatedAt: credential?.updatedAt ?? null,
    };
  });
}

export async function setBabyLoveGrowthAutoPublish(blogId: string, autoPublish: boolean) {
  return setBabyLoveGrowthSettings(blogId, { autoPublish });
}

export async function setBabyLoveGrowthSettings(
  blogId: string,
  input: { autoPublish?: boolean; defaultTags?: string[] }
) {
  const blog = await prisma.blog.findUnique({
    where: { id: blogId },
    select: { id: true, name: true, slug: true },
  });
  if (!blog) throw new Error("Blog not found.");
  const existing = await latestBabyLoveGrowthCredential(blogId);
  const settings = {
    ...parseBabyLoveGrowthSettings(existing?.settingsJson),
    ...(input.autoPublish === undefined ? {} : { autoPublish: input.autoPublish }),
    ...(input.defaultTags === undefined ? {} : { defaultTags: normalizeTagList(input.defaultTags) }),
  };

  const credential = existing
    ? await prisma.integrationCredential.update({
        where: { id: existing.id },
        data: {
          enabled: true,
          settingsJson: settings as Prisma.InputJsonValue,
        },
      })
    : await prisma.integrationCredential.create({
        data: {
          blogId,
          provider: "BABYLOVEGROWTH",
          name: SETTINGS_CREDENTIAL_NAME,
          enabled: true,
          settingsJson: settings as Prisma.InputJsonValue,
        },
      });

  return {
    blogId: blog.id,
    blogName: blog.name,
    blogSlug: blog.slug,
    ...parseBabyLoveGrowthSettings(credential.settingsJson),
    enabled: credential.enabled,
    updatedAt: credential.updatedAt,
  };
}

export async function importBabyLoveGrowthArticle(blogId: string, payload: BabyLoveGrowthPayload) {
  const sourceId = payload.id ?? payload.articleId;
  const externalArticleId = sourceId === undefined || sourceId === null ? "" : String(sourceId);
  if (!externalArticleId) throw new Error("BabyLoveGrowth article ID is required.");
  const existing = await prisma.babyLoveGrowthImport.findUnique({
    where: { blogId_externalArticleId: { blogId, externalArticleId } },
  });
  if (existing?.articleId) {
    const articleStillExists = await prisma.article.findUnique({
      where: { id: existing.articleId },
      select: { id: true },
    });
    if (articleStillExists) return maybeAutoPublishImport(existing);
  }

  const settings = await babyLoveGrowthSettings(blogId);
  const payloadTags = normalizeTagList(payload.tags);
  const article = await createArticle(blogId, {
    title: payload.title || "Untitled BabyLoveGrowth Article",
    slug: ensureSlug(payload.slug || payload.title || externalArticleId),
    markdown: payload.content_markdown || payload.markdown || payload.content || payload.content_html || "",
    excerpt: payload.excerpt || payload.metaDescription,
    metaTitle: payload.metaTitle || payload.title,
    metaDescription: payload.metaDescription,
    tags: payloadTags.length ? payloadTags : settings.defaultTags,
    source: "BABYLOVEGROWTH",
    sourceExternalId: externalArticleId,
    noindex: false,
  });

  const imported = await prisma.babyLoveGrowthImport.upsert({
    where: { blogId_externalArticleId: { blogId, externalArticleId } },
    create: {
      blogId,
      externalArticleId,
      status: "IMPORTED",
      articleId: article!.id,
      rawPayloadJson: payload as Prisma.InputJsonValue,
    },
    update: {
      status: existing ? "REIMPORTED_AFTER_DELETE" : "IMPORTED",
      articleId: article!.id,
      rawPayloadJson: payload as Prisma.InputJsonValue,
    },
  });
  return maybeAutoPublishImport(imported);
}

export async function syncBabyLoveGrowth() {
  await prisma.job.create({
    data: {
      type: "BABYLOVEGROWTH_SYNC",
      payloadJson: {},
    },
  });
  return { queued: true };
}

async function babyLoveGrowthAutoPublishEnabled(blogId: string) {
  return (await babyLoveGrowthSettings(blogId)).autoPublish;
}

async function babyLoveGrowthSettings(blogId: string) {
  const credential = await latestBabyLoveGrowthCredential(blogId);
  if (!credential?.enabled) return { autoPublish: false, defaultTags: [] };
  return parseBabyLoveGrowthSettings(credential.settingsJson);
}

async function latestBabyLoveGrowthCredential(blogId: string) {
  return prisma.integrationCredential.findFirst({
    where: {
      blogId,
      provider: "BABYLOVEGROWTH",
      name: SETTINGS_CREDENTIAL_NAME,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

async function maybeAutoPublishImport(imported: BabyLoveGrowthImport) {
  if (!imported.articleId || !(await babyLoveGrowthAutoPublishEnabled(imported.blogId))) {
    return imported;
  }

  try {
    await publishArticle(imported.articleId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-publish failed.";
    return prisma.babyLoveGrowthImport.update({
      where: { id: imported.id },
      data: { status: `AUTO_PUBLISH_FAILED: ${message.slice(0, 240)}` },
    });
  }

  try {
    await buildAndDeployAutoPublishedArticle(imported.articleId);
    return prisma.babyLoveGrowthImport.update({
      where: { id: imported.id },
      data: { status: "AUTO_PUBLISHED_AND_UPLOADED" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-upload failed.";
    return prisma.babyLoveGrowthImport.update({
      where: { id: imported.id },
      data: { status: `AUTO_UPLOAD_FAILED: ${message.slice(0, 240)}` },
    });
  }
}

async function buildAndDeployAutoPublishedArticle(articleId: string) {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { blog: { select: { baseUrl: true } } },
  });
  const target = await prisma.deploymentTarget.findFirst({
    where: { blogId: article.blogId },
    orderBy: { createdAt: "desc" },
  });
  if (!target) {
    throw new Error("Article is published, but upload failed: no deployment target is saved for this blog.");
  }
  const articleUrl = canonicalArticleUrl(article.blog.baseUrl, article.slug, target.cleanUrlMode !== "HTML");
  const mainPageUrl = article.blog.baseUrl;
  let build;
  try {
    build = await buildBlogStaticSite(article.blogId, "ARTICLE_PUBLISH");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Static build failed.";
    throw new Error(`Article is published, but static build failed: ${message}`);
  }

  try {
    await deployBuild(build.id, {
      publicVerifications: [
        { url: articleUrl, expectedText: article.title },
        { url: mainPageUrl, expectedText: article.title },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FTP/SFTP upload failed.";
    throw new Error(`Article is published, but FTP/SFTP upload failed: ${message}`);
  }
}

function parseBabyLoveGrowthSettings(settingsJson: unknown): BabyLoveGrowthSettingsJson {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return { autoPublish: false, defaultTags: [] };
  }
  const settings = settingsJson as Record<string, unknown>;
  return {
    autoPublish: settings.autoPublish === true,
    defaultTags: normalizeTagList(settings.defaultTags),
  };
}

function normalizeTagList(tags: unknown) {
  if (typeof tags === "string") return normalizeTagText(tags);
  if (!Array.isArray(tags)) return [];
  return normalizeTagText(tags.map((tag) => String(tag)).join(","));
}

function normalizeTagText(tags: string) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags.split(",")) {
    const value = tag.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    normalized.push(value);
  }
  return normalized;
}
