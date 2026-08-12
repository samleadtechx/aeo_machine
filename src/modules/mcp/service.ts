import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { createArticle, updateArticle } from "@/modules/articles/service";
import type { FunnelInput } from "@/lib/validation/funnels";
import { createMediaAsset, listMediaAssets } from "@/modules/media/service";
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
  "media.read",
  "media.upload",
  "leads.read_summary",
];

const maxMcpMediaUploadBytes = 12 * 1024 * 1024;

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
    case "list_media_assets":
      assertAnyPermission(permissions, ["media.read", "forms.read"]);
      if (typeof args.blogId === "string") {
        assertBlogScope(blogScope, args.blogId);
        return (await listMediaAssets(args.blogId)).map(mcpMediaAsset);
      }
      if (blogScope) {
        const assets = await prisma.mediaAsset.findMany({
          where: { OR: [{ blogId: { in: blogScope } }, { blogId: null }] },
          orderBy: { createdAt: "desc" },
        });
        return assets.map(mcpMediaAsset);
      }
      return (await listMediaAssets()).map(mcpMediaAsset);
    case "upload_media_asset":
      assertAnyPermission(permissions, ["media.upload", "forms.create", "forms.update"]);
      assertBlogScope(blogScope, requiredStringArg(args, "blogId"));
      {
        const upload = await mediaUploadInput(args);
        const media = await createMediaAsset({
          blogId: requiredStringArg(args, "blogId"),
          originalName: upload.filename,
          mimeType: upload.mimeType,
          bytes: upload.bytes,
          altText: typeof args.altText === "string" ? args.altText : null,
          role: args.role === "logo" ? "logo" : "article",
        });
        return {
          ...mcpMediaAsset(media),
          imageMediaId: media.id,
          markdownToken: `media:${media.id}`,
          funnelOptionJson: {
            label: typeof args.optionLabel === "string" ? args.optionLabel : "Answer label",
            value: typeof args.optionValue === "string" ? args.optionValue : "answer_value",
            imageMediaId: media.id,
          },
        };
      }
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

function assertAnyPermission(permissions: string[], allowed: string[]) {
  if (!allowed.some((permission) => permissions.includes(permission))) {
    throw new Error(`MCP permission denied: one of ${allowed.join(", ")}`);
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

function mcpMediaAsset(asset: {
  id: string;
  blogId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  publicPath: string;
  altText: string | null;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    blogId: asset.blogId,
    filename: asset.filename,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    publicPath: asset.publicPath,
    altText: asset.altText,
    createdAt: asset.createdAt,
  };
}

async function mediaUploadInput(args: Record<string, unknown>) {
  if (typeof args.dataBase64 === "string" && args.dataBase64.trim()) {
    return mediaUploadFromBase64(args);
  }
  if (typeof args.sourceUrl === "string" && args.sourceUrl.trim()) {
    return mediaUploadFromUrl(args);
  }
  throw new Error("MCP argument required: dataBase64 or sourceUrl");
}

function mediaUploadFromBase64(args: Record<string, unknown>) {
  const input = requiredStringArg(args, "dataBase64");
  const dataUrl = input.match(/^data:([^;,]+);base64,(.+)$/i);
  const mimeType = normalizedMimeType(dataUrl?.[1] || args.mimeType || mimeTypeFromFilename(String(args.filename || "")));
  const base64 = dataUrl?.[2] || input;
  if (!mimeType) throw new Error("MCP argument required: mimeType for base64 media uploads.");
  if (!/^[a-z0-9+/=\s_-]+$/i.test(base64)) throw new Error("Invalid base64 media payload.");
  const bytes = Buffer.from(base64.replace(/\s/g, ""), "base64");
  assertMediaSize(bytes);
  return {
    bytes,
    mimeType,
    filename: filenameArg(args, mimeType),
  };
}

async function mediaUploadFromUrl(args: Record<string, unknown>) {
  const sourceUrl = requiredStringArg(args, "sourceUrl");
  const url = new URL(sourceUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP sourceUrl must be http or https.");
  }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Could not fetch MCP media source: HTTP ${response.status}.`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxMcpMediaUploadBytes) {
    throw new Error("MCP media source is too large.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assertMediaSize(bytes);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
  const mimeType = normalizedMimeType(args.mimeType || contentType || mimeTypeFromFilename(url.pathname));
  if (!mimeType) throw new Error("Could not detect MCP media source image type.");
  return {
    bytes,
    mimeType,
    filename: filenameArg(args, mimeType, filenameFromUrl(url, mimeType)),
  };
}

function assertMediaSize(bytes: Buffer) {
  if (!bytes.length) throw new Error("MCP media upload is empty.");
  if (bytes.length > maxMcpMediaUploadBytes) throw new Error("MCP media upload is too large.");
}

function filenameArg(args: Record<string, unknown>, mimeType: string, fallback = "funnel-image") {
  const raw = typeof args.filename === "string" && args.filename.trim() ? args.filename.trim() : fallback;
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(raw);
  return hasExtension ? raw : `${raw}${extensionForMime(mimeType)}`;
}

function normalizedMimeType(value: unknown) {
  const mimeType = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(mimeType)) {
    return mimeType;
  }
  return null;
}

function mimeTypeFromFilename(filename: string) {
  const extension = filename.split("?")[0]?.split("#")[0]?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return null;
}

function filenameFromUrl(url: URL, mimeType: string) {
  const basename = url.pathname.split("/").filter(Boolean).pop() || "funnel-image";
  return /\.[a-z0-9]{2,5}$/i.test(basename) ? basename : `${basename}${extensionForMime(mimeType)}`;
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  return "";
}
