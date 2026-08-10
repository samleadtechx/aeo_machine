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
  const args = request.arguments || {};

  switch (request.tool) {
    case "list_blogs":
      assertPermission(permissions, "blogs.read");
      return prisma.blog.findMany({
        select: { id: true, name: true, slug: true, baseUrl: true, brandName: true, defaultAuthorName: true },
      });
    case "get_blog":
      assertPermission(permissions, "blogs.read");
      return prisma.blog.findUnique({
        where: { id: String(args.blogId) },
        select: { id: true, name: true, slug: true, baseUrl: true, brandName: true, primaryColor: true, accentColor: true },
      });
    case "list_articles":
      assertPermission(permissions, "articles.read");
      return prisma.article.findMany({
        where: args.blogId ? { blogId: String(args.blogId) } : undefined,
        select: { id: true, blogId: true, title: true, slug: true, status: true, source: true, seoGateStatus: true },
        orderBy: { updatedAt: "desc" },
      });
    case "get_article":
      assertPermission(permissions, "articles.read");
      return prisma.article.findUnique({
        where: { id: String(args.articleId) },
        include: { tags: { include: { tag: true } }, seoAuditIssues: true },
      });
    case "create_article_draft":
      assertPermission(permissions, "articles.create_draft");
      return createArticle(String(args.blogId), {
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
      return updateArticle(String(args.articleId), {
        title: typeof args.title === "string" ? args.title : undefined,
        markdown: typeof args.markdown === "string" ? args.markdown : undefined,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        metaTitle: typeof args.metaTitle === "string" ? args.metaTitle : undefined,
        metaDescription: typeof args.metaDescription === "string" ? args.metaDescription : undefined,
        source: "MCP",
      });
    case "list_funnels":
      assertPermission(permissions, "forms.read");
      return listFunnels(typeof args.blogId === "string" ? args.blogId : undefined);
    case "get_funnel":
      assertPermission(permissions, "forms.read");
      return getFunnel(String(args.funnelId));
    case "create_funnel":
      assertPermission(permissions, "forms.create");
      return createFunnel(String(args.blogId), {
        name: typeof args.name === "string" ? args.name : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        status: funnelStatusArg(args.status, "DRAFT"),
        configJson: funnelConfigArg(args.configJson),
        styleJson: objectArg(args.styleJson),
        trackingJson: objectArg(args.trackingJson),
      });
    case "update_funnel":
      assertPermission(permissions, "forms.update");
      return updateFunnel(String(args.funnelId), {
        name: typeof args.name === "string" ? args.name : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        status: funnelStatusArg(args.status),
        configJson: funnelConfigArg(args.configJson),
        styleJson: objectArg(args.styleJson),
        trackingJson: objectArg(args.trackingJson),
      });
    case "set_funnel_status":
      assertPermission(permissions, "forms.update");
      return updateFunnel(String(args.funnelId), {
        status: funnelStatusArg(args.status),
      });
    case "archive_funnel":
      assertPermission(permissions, "forms.archive");
      return updateFunnel(String(args.funnelId), { status: "ARCHIVED" });
    case "add_funnel_placement_rule":
      assertPermission(permissions, "forms.place");
      return upsertPlacementRule(String(args.funnelId), {
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
