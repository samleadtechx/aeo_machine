import type { BabyLoveGrowthImport, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureSlug } from "@/lib/utils/slugify";
import { createArticle, publishArticle } from "@/modules/articles/service";

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
  tags?: string[];
};

type BabyLoveGrowthSettingsJson = {
  autoPublish: boolean;
};

export type BabyLoveGrowthBlogSetting = {
  blogId: string;
  blogName: string;
  blogSlug: string;
  autoPublish: boolean;
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
      enabled: credential?.enabled ?? true,
      updatedAt: credential?.updatedAt ?? null,
    };
  });
}

export async function setBabyLoveGrowthAutoPublish(blogId: string, autoPublish: boolean) {
  const blog = await prisma.blog.findUnique({
    where: { id: blogId },
    select: { id: true, name: true, slug: true },
  });
  if (!blog) throw new Error("Blog not found.");
  const existing = await latestBabyLoveGrowthCredential(blogId);
  const settings = {
    ...parseBabyLoveGrowthSettings(existing?.settingsJson),
    autoPublish,
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
    autoPublish: parseBabyLoveGrowthSettings(credential.settingsJson).autoPublish,
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

  const article = await createArticle(blogId, {
    title: payload.title || "Untitled BabyLoveGrowth Article",
    slug: ensureSlug(payload.slug || payload.title || externalArticleId),
    markdown: payload.content_markdown || payload.markdown || payload.content || payload.content_html || "",
    excerpt: payload.excerpt || payload.metaDescription,
    metaTitle: payload.metaTitle || payload.title,
    metaDescription: payload.metaDescription,
    tags: payload.tags?.length ? payload.tags : ["BabyLoveGrowth", "Imported"],
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
  const credential = await latestBabyLoveGrowthCredential(blogId);
  if (!credential?.enabled) return false;
  return parseBabyLoveGrowthSettings(credential.settingsJson).autoPublish;
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
    return prisma.babyLoveGrowthImport.update({
      where: { id: imported.id },
      data: { status: "AUTO_PUBLISHED" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-publish failed.";
    return prisma.babyLoveGrowthImport.update({
      where: { id: imported.id },
      data: { status: `AUTO_PUBLISH_FAILED: ${message.slice(0, 240)}` },
    });
  }
}

function parseBabyLoveGrowthSettings(settingsJson: unknown): BabyLoveGrowthSettingsJson {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return { autoPublish: false };
  }
  const settings = settingsJson as Record<string, unknown>;
  return { autoPublish: settings.autoPublish === true };
}
