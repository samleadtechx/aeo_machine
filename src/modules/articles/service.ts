import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { articleInputSchema, type ArticleInput } from "@/lib/validation/articles";
import { canonicalArticleUrl } from "@/lib/utils/url";
import { ensureSlug } from "@/lib/utils/slugify";
import { auditArticleSeo } from "@/modules/seo/audit";
import { excerptFromMarkdown, markdownToHtml } from "@/modules/articles/markdown";

export async function listArticles(blogId?: string) {
  return prisma.article.findMany({
    where: blogId ? { blogId } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      blog: { select: { name: true, slug: true, baseUrl: true } },
      tags: { include: { tag: true } },
      seoAuditIssues: { orderBy: [{ severity: "asc" }, { createdAt: "desc" }] },
    },
  });
}

export async function getArticle(id: string) {
  return prisma.article.findUnique({
    where: { id },
    include: {
      blog: true,
      tags: { include: { tag: true } },
      seoAuditIssues: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function createArticle(blogId: string, input: ArticleInput) {
  const blog = await prisma.blog.findUniqueOrThrow({ where: { id: blogId } });
  const parsed = normalizeArticleInput(input, blog.baseUrl, blog.defaultAuthorName);
  const htmlCache = await markdownToHtml(parsed.markdown);
  const article = await prisma.article.create({
    data: {
      blogId,
      title: parsed.title,
      slug: parsed.slug,
      source: parsed.source,
      sourceExternalId: parsed.sourceExternalId,
      markdown: parsed.markdown,
      htmlCache,
      excerpt: parsed.excerpt || excerptFromMarkdown(parsed.markdown),
      metaTitle: parsed.metaTitle,
      metaDescription: parsed.metaDescription,
      canonicalUrl: parsed.canonicalUrl,
      heroMediaId: parsed.heroMediaId,
      heroAlt: parsed.heroAlt,
      authorName: parsed.authorName,
      noindex: parsed.noindex,
    },
  });
  await syncArticleTags(article.id, blogId, parsed.tags);
  return runAndPersistSeoAudit(article.id);
}

export async function updateArticle(id: string, input: Partial<ArticleInput>) {
  const existing = await prisma.article.findUniqueOrThrow({
    where: { id },
    include: { blog: true },
  });
  if (existing.status === "PUBLISHED" && input.source === "MCP") {
    throw new Error("MCP cannot update published articles in V1.");
  }
  const merged = normalizeArticleInput(
    {
      title: input.title ?? existing.title,
      slug: input.slug ?? existing.slug,
      markdown: input.markdown ?? existing.markdown,
      excerpt: input.excerpt === undefined ? existing.excerpt : input.excerpt,
      metaTitle: input.metaTitle === undefined ? existing.metaTitle : input.metaTitle,
      metaDescription:
        input.metaDescription === undefined ? existing.metaDescription : input.metaDescription,
      canonicalUrl: input.canonicalUrl === undefined ? existing.canonicalUrl : input.canonicalUrl,
      heroMediaId: input.heroMediaId === undefined ? existing.heroMediaId : input.heroMediaId,
      heroAlt: input.heroAlt === undefined ? existing.heroAlt : input.heroAlt,
      authorName: input.authorName === undefined ? existing.authorName : input.authorName,
      noindex: input.noindex ?? existing.noindex,
      tags: input.tags ?? (await articleTagNames(id)),
      source: input.source ?? existing.source,
      sourceExternalId: input.sourceExternalId === undefined ? existing.sourceExternalId : input.sourceExternalId,
    },
    existing.blog.baseUrl,
    existing.blog.defaultAuthorName
  );
  const htmlCache = await markdownToHtml(merged.markdown);
  await prisma.article.update({
    where: { id },
    data: {
      title: merged.title,
      slug: merged.slug,
      sourceExternalId: merged.sourceExternalId,
      markdown: merged.markdown,
      htmlCache,
      excerpt: merged.excerpt || excerptFromMarkdown(merged.markdown),
      metaTitle: merged.metaTitle,
      metaDescription: merged.metaDescription,
      canonicalUrl: merged.canonicalUrl,
      heroMediaId: merged.heroMediaId,
      heroAlt: merged.heroAlt,
      authorName: merged.authorName,
      noindex: merged.noindex,
    },
  });
  await syncArticleTags(id, existing.blogId, merged.tags);
  return runAndPersistSeoAudit(id);
}

export async function setArticleStatus(id: string, status: "REVIEW" | "APPROVED" | "ARCHIVED") {
  return prisma.article.update({ where: { id }, data: { status } });
}

export async function publishArticle(id: string) {
  const audited = await runAndPersistSeoAudit(id);
  if (!audited || audited.seoGateStatus === "FAIL") {
    const blockers = audited?.seoAuditIssues
      ?.filter((issue) => issue.severity === "BLOCKER")
      .map((issue) => issue.message)
      .slice(0, 5);
    const detail = blockers?.length ? ` ${blockers.join(" ")}` : " Fix blocker SEO/AEO issues first.";
    throw new Error(`Publishing gate failed.${detail}`);
  }
  return prisma.article.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: audited.publishedAt ?? new Date(),
    },
  });
}

export async function unpublishArticle(id: string) {
  return prisma.article.update({
    where: { id },
    data: { status: "DRAFT", publishedAt: null },
  });
}

export async function deleteArticle(id: string) {
  await prisma.article.delete({ where: { id } });
  return { ok: true };
}

export async function runAndPersistSeoAudit(id: string) {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id },
    include: { blog: true, tags: { include: { tag: true } } },
  });
  const tagList = article.tags.map((entry) => entry.tag);
  const audit = auditArticleSeo(article, article.blog, tagList);
  await prisma.$transaction([
    prisma.seoAuditIssue.deleteMany({ where: { articleId: id } }),
    prisma.seoAuditIssue.createMany({
      data: audit.issues.map((issue) => ({
        articleId: id,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        detailsJson: issue.details as Prisma.InputJsonValue | undefined,
      })),
    }),
    prisma.article.update({
      where: { id },
      data: {
        seoGateStatus: audit.status,
        seoScore: audit.score,
        seoGateDetailsJson: audit as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  return prisma.article.findUnique({
    where: { id },
    include: { blog: true, tags: { include: { tag: true } }, seoAuditIssues: true },
  });
}

async function syncArticleTags(articleId: string, blogId: string, tagNames: string[]) {
  const normalized = Array.from(
    new Set(tagNames.map((tag) => tag.trim()).filter(Boolean))
  );
  const tags = await Promise.all(
    normalized.map((name) => {
      const slug = ensureSlug(name);
      return prisma.tag.upsert({
        where: { blogId_slug: { blogId, slug } },
        create: { blogId, slug, name },
        update: { name },
      });
    })
  );
  await prisma.$transaction([
    prisma.articleTag.deleteMany({ where: { articleId } }),
    ...tags.map((tag) =>
      prisma.articleTag.create({
        data: { articleId, tagId: tag.id },
      })
    ),
  ]);
}

async function articleTagNames(articleId: string) {
  const tags = await prisma.articleTag.findMany({
    where: { articleId },
    include: { tag: true },
  });
  return tags.map((entry) => entry.tag.name);
}

function normalizeArticleInput(input: ArticleInput, baseUrl: string, defaultAuthorName: string) {
  const parsed = articleInputSchema.parse({
    ...input,
    slug: ensureSlug(input.slug || input.title),
    canonicalUrl: input.canonicalUrl || canonicalArticleUrl(baseUrl, ensureSlug(input.slug || input.title)),
    authorName: input.authorName || defaultAuthorName,
  });
  return parsed;
}

export type ArticleWithDetails = Prisma.PromiseReturnType<typeof getArticle>;
