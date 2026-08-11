import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { createArticle, updateArticle } from "@/modules/articles/service";
import type { FunnelInput } from "@/lib/validation/funnels";
import {
  createFunnel,
  getFunnel,
  listFunnels,
  updateFunnel,
  upsertPlacementRule,
} from "@/modules/forms/service";

type McpRequest = {
  tool: string;
  arguments?: Record<string, unknown>;
};

export const defaultMcpPermissions = [
  "blogs.read",
  "articles.read",
  "articles.create_draft",
  "articles.update_draft",
  "forms.read",
  "forms.create",
  "forms.update",
  "forms.place",
  "forms.archive",
  "leads.read_summary",
];

export async function authenticateMcpToken(authorization: string | null) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("MCP bearer token required.");
  const record = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || !record.enabled) throw new Error("MCP token rejected.");
  await prisma.mcpToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return record;
}

export async function handleMcpToolCall(authorization: string | null, request: McpRequest) {
  const token = await authenticateMcpToken(authorization);
  const permissions = Array.isArray(token.permissionsJson)
    ? token.permissionsJson.map(String)
    : defaultMcpPermissions;
  const blogScope = scopedBlogIds(token.blogScopeJson);
  const args = request.arguments || {};

  switch (request.tool) {
    case "list_blogs":
      assertPermission(permissions, "blogs.read");
      return prisma.blog.findMany({
        where: blogScope ? { id: { in: blogScope } } : undefined,
        select: { id: true, name: true, slug: true, baseUrl: true, brandName: true, defaultAuthorName: true },
      });
    case "get_blog":
      assertPermission(permissions, "blogs.read");
      assertBlogScope(blogScope, requiredStringArg(args, "blogId"));
      return prisma.blog.findUnique({
        where: { id: requiredStringArg(args, "blogId") },
        select: { id: true, name: true, slug: true, baseUrl: true, brandName: true, primaryColor: true, accentColor: true },
      });
    case "list_articles":
      assertPermission(permissions, "articles.read");
      if (typeof args.blogId === "string") assertBlogScope(blogScope, args.blogId);
      return prisma.article.findMany({
        where: typeof args.blogId === "string" ? { blogId: args.blogId } : blogScope ? { blogId: { in: blogScope } } : undefined,
        select: { id: true, blogId: true, title: true, slug: true, status: true, source: true, seoGateStatus: true },
        orderBy: { updatedAt: "desc" },
      });
    case "get_article":
      assertPermission(permissions, "articles.read");
      {
        const article = await prisma.article.findUnique({
          where: { id: requiredStringArg(args, "articleId") },
          include: { tags: { include: { tag: true } }, seoAuditIssues: true },
        });
        if (article) assertBlogScope(blogScope, article.blogId);
        return article;
      }
    case "create_article_draft":
      assertPermission(permissions, "articles.create_draft");
      assertBlogScope(blogScope, requiredStringArg(args, "blogId"));
      return createArticle(requiredStringArg(args, "blogId"), {
        title: String(args.title || "Untitled Draft"),
        slug: String(args.slug || args.title || "untitled-draft"),
        markdown: String(args.markdown || ""),
        tags: Array.isArray(args.tags) ? args.tags.map(String) : ["MCP"],
        metaTitle: typeof args.metaTitle === "string" ? args.metaTitle : undefined,
        metaDescription: typeof args.metaDescription === "string" ? args.metaDescription : undefined,
        source: "MCP",
        noindex: Boolean(args.noindex),
      });
    case "update_article_draft":
      assertPermission(permissions, "articles.update_draft");
      {
        const existing = await prisma.article.findUniqueOrThrow({
          where: { id: requiredStringArg(args, "articleId") },
          select: { blogId: true },
        });
        assertBlogScope(blogScope, existing.blogId);
        return updateArticle(requiredStringArg(args, "articleId"), {
          title: typeof args.title === "string" ? args.title : undefined,
          markdown: typeof args.markdown === "string" ? args.markdown : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
          metaTitle: typeof args.metaTitle === "string" ? args.metaTitle : undefined,
          metaDescription: typeof args.metaDescription === "string" ? args.metaDescription : undefined,
          source: "MCP",
        });
      }
    case "list_funnels":
      assertPermission(permissions, "forms.read");
      if (typeof args.blogId === "string") {
        assertBlogScope(blogScope, args.blogId);
        return listFunnels(args.blogId);
      }
      if (blogScope) {
        return prisma.funnel.findMany({
          where: { blogId: { in: blogScope } },
          orderBy: { updatedAt: "desc" },
          include: {
            blog: { select: { name: true, slug: true } },
            placementRules: { orderBy: { priority: "asc" } },
            _count: { select: { leads: true } },
          },
        });
      }
      return listFunnels();
    case "get_funnel":
      assertPermission(permissions, "forms.read");
      {
        const funnel = await getFunnel(requiredStringArg(args, "funnelId"));
        if (funnel) assertBlogScope(blogScope, funnel.blogId);
        return funnel;
      }
    case "create_funnel":
      assertPermission(permissions, "forms.create");
      assertBlogScope(blogScope, requiredStringArg(args, "blogId"));
      return createFunnel(requiredStringArg(args, "blogId"), {
        name: typeof args.name === "string" ? args.name : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        status: funnelStatusArg(args.status, "DRAFT"),
        configJson: funnelConfigArg(args.configJson),
        styleJson: objectArg(args.styleJson),
        trackingJson: objectArg(args.trackingJson),
      });
    case "update_funnel":
      assertPermission(permissions, "forms.update");
      await assertFunnelScope(blogScope, requiredStringArg(args, "funnelId"));
      return updateFunnel(requiredStringArg(args, "funnelId"), {
        name: typeof args.name === "string" ? args.name : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        status: funnelStatusArg(args.status),
        configJson: funnelConfigArg(args.configJson),
        styleJson: objectArg(args.styleJson),
        trackingJson: objectArg(args.trackingJson),
      });
    case "set_funnel_status":
      assertPermission(permissions, "forms.update");
      await assertFunnelScope(blogScope, requiredStringArg(args, "funnelId"));
      return updateFunnel(requiredStringArg(args, "funnelId"), {
        status: funnelStatusArg(args.status),
      });
    case "archive_funnel":
      assertPermission(permissions, "forms.archive");
      await assertFunnelScope(blogScope, requiredStringArg(args, "funnelId"));
      return updateFunnel(requiredStringArg(args, "funnelId"), { status: "ARCHIVED" });
    case "add_funnel_placement_rule":
      assertPermission(permissions, "forms.place");
      await assertFunnelScope(blogScope, requiredStringArg(args, "funnelId"));
      return upsertPlacementRule(requiredStringArg(args, "funnelId"), {
        name: typeof args.name === "string" ? args.name : "MCP placement rule",
        enabled: typeof args.enabled === "boolean" ? args.enabled : true,
        matchMode: typeof args.matchMode === "string" ? args.matchMode : "ANY_TAG",
        tagSlugs: Array.isArray(args.tagSlugs) ? args.tagSlugs.map(String) : [],
        placement: typeof args.placement === "string" ? args.placement : "END",
        priority: typeof args.priority === "number" ? args.priority : 100,
      });
    case "get_seo_requirements":
      return {
        blockers: [
          "title",
          "slug",
          "metaTitle",
          "metaDescription 90-165 characters",
          "canonicalUrl",
          "body",
          "author",
          "at least one tag",
          "heroAlt when hero exists",
        ],
      };
    default:
      throw new Error(`Unknown MCP tool: ${request.tool}`);
  }
}

function assertPermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw new Error(`MCP permission denied: ${permission}`);
  }
}

function scopedBlogIds(scope: unknown) {
  if (!scope || typeof scope !== "object") return null;
  const blogIds = (scope as { blogIds?: unknown }).blogIds;
  if (!Array.isArray(blogIds) || blogIds.length === 0) return null;
  return blogIds.map(String);
}

function assertBlogScope(blogScope: string[] | null, blogId: string | null) {
  if (!blogScope) return;
  if (!blogId || !blogScope.includes(blogId)) {
    throw new Error("MCP token is not scoped to this blog.");
  }
}

async function assertFunnelScope(blogScope: string[] | null, funnelId: string) {
  if (!blogScope) return;
  const funnel = await prisma.funnel.findUniqueOrThrow({
    where: { id: funnelId },
    select: { blogId: true },
  });
  assertBlogScope(blogScope, funnel.blogId);
}

function requiredStringArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`MCP argument required: ${name}`);
  }
  return value.trim();
}

function objectArg(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function funnelConfigArg(value: unknown) {
  return value === undefined ? undefined : (value as FunnelInput["configJson"]);
}

function funnelStatusArg(value: unknown, fallback?: FunnelInput["status"]) {
  if (value === "DRAFT" || value === "ACTIVE" || value === "ARCHIVED") return value;
  return fallback;
}
