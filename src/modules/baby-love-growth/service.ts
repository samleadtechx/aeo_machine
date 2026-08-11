import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureSlug } from "@/lib/utils/slugify";
import { createArticle } from "@/modules/articles/service";

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

export async function importBabyLoveGrowthArticle(blogId: string, payload: BabyLoveGrowthPayload) {
  const externalArticleId = String(payload.id || payload.articleId || "");
  if (!externalArticleId) throw new Error("BabyLoveGrowth article ID is required.");
  const existing = await prisma.babyLoveGrowthImport.findUnique({
    where: { blogId_externalArticleId: { blogId, externalArticleId } },
  });
  if (existing) return existing;

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

  return prisma.babyLoveGrowthImport.create({
    data: {
      blogId,
      externalArticleId,
      status: "IMPORTED",
      articleId: article!.id,
      rawPayloadJson: payload as Prisma.InputJsonValue,
    },
  });
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
