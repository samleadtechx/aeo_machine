import { createHash } from "crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { appUrl, storageDir } from "@/lib/env";
import { ensureSlug } from "@/lib/utils/slugify";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export type BuildMediaMap = Record<string, string>;
export type BuildImageSourceMap = Record<string, string>;

const maxRemoteImageBytes = 12 * 1024 * 1024;

export async function listMediaAssets(blogId?: string) {
  return prisma.mediaAsset.findMany({
    where: blogId ? { OR: [{ blogId }, { blogId: null }] } : undefined,
    include: { blog: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMediaAsset(input: {
  blogId?: string | null;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  altText?: string | null;
}) {
  if (!allowedMimeTypes.has(input.mimeType)) {
    throw new Error("Unsupported image type.");
  }
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const extension = extensionFor(input.originalName, input.mimeType);
  const basename = ensureSlug(path.basename(input.originalName, path.extname(input.originalName)), "image");
  const filename = `${basename}-${nanoid(10)}${extension}`;
  const relativeDir = path.join("media", input.blogId || "global");
  const relativePath = path.join(relativeDir, filename);
  const absoluteDir = path.resolve(storageDir(), relativeDir);
  const absolutePath = path.resolve(storageDir(), relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, input.bytes);

  return prisma.mediaAsset.create({
    data: {
      blogId: input.blogId || null,
      filename,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      storagePath: relativePath.split(path.sep).join("/"),
      publicPath: `/assets/media/${filename}`,
      altText: input.altText || null,
      hash,
    },
  });
}

export async function copyMediaAssetsToBuild(blogId: string, mediaIds: string[], outputPath: string) {
  const uniqueIds = Array.from(new Set(mediaIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: { in: uniqueIds },
      OR: [{ blogId }, { blogId: null }],
    },
  });
  const mediaDir = path.join(outputPath, "assets", "media");
  await mkdir(mediaDir, { recursive: true });

  const map: BuildMediaMap = {};
  for (const asset of assets) {
    const source = path.resolve(storageDir(), asset.storagePath);
    await stat(source);
    const target = path.join(mediaDir, asset.filename);
    await copyFile(source, target);
    const buildPath = `/assets/media/${asset.filename}`;
    map[asset.id] = buildPath;
    map[asset.publicPath] = buildPath;
    map[asset.storagePath] = buildPath;
    map[`/${asset.storagePath}`] = buildPath;
    map[absoluteAppAssetUrl(asset.publicPath)] = buildPath;
  }
  return map;
}

export async function copyRemoteImagesToBuild(imageSources: string[], outputPath: string) {
  const uniqueSources = Array.from(new Set(imageSources.filter(isRemoteImageSource)));
  if (uniqueSources.length === 0) return {};

  const mediaDir = path.join(outputPath, "assets", "media");
  await mkdir(mediaDir, { recursive: true });

  const map: BuildImageSourceMap = {};
  for (const source of uniqueSources) {
    const response = await fetch(source, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Could not localize image "${source}" during render: HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
    const mimeType = allowedMimeTypes.has(contentType) ? contentType : mimeTypeFromUrl(source);
    if (!mimeType || !allowedMimeTypes.has(mimeType)) {
      throw new Error(`Could not localize image "${source}" during render: unsupported content type.`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxRemoteImageBytes) {
      throw new Error(`Could not localize image "${source}" during render: file is too large.`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxRemoteImageBytes) {
      throw new Error(`Could not localize image "${source}" during render: file is too large.`);
    }

    const originalName = originalNameFromUrl(source, mimeType);
    const basename = ensureSlug(path.basename(originalName, path.extname(originalName)), "image");
    const filename = `${basename}-${nanoid(10)}${extensionFor(originalName, mimeType)}`;
    await writeFile(path.join(mediaDir, filename), bytes);
    map[source] = `/assets/media/${filename}`;
  }

  return map;
}

export async function collectReferencedMediaIds(blogId: string, input: {
  articles: Array<{ heroMediaId: string | null; markdown: string }>;
  funnels: Array<{ configJson: unknown }>;
}) {
  const ids = new Set<string>();
  for (const article of input.articles) {
    if (article.heroMediaId) ids.add(article.heroMediaId);
  }
  for (const funnel of input.funnels) {
    collectMediaIdsFromJson(funnel.configJson, ids);
  }

  const media = await prisma.mediaAsset.findMany({
    where: { OR: [{ blogId }, { blogId: null }] },
    select: { id: true, filename: true, publicPath: true, storagePath: true },
  });
  for (const article of input.articles) {
    for (const asset of media) {
      if (
        article.markdown.includes(`media:${asset.id}`) ||
        article.markdown.includes(asset.publicPath) ||
        article.markdown.includes(asset.storagePath) ||
        article.markdown.includes(asset.filename)
      ) {
        ids.add(asset.id);
      }
    }
  }
  for (const funnel of input.funnels) {
    const serializedConfig = JSON.stringify(funnel.configJson || {});
    for (const asset of media) {
      if (
        serializedConfig.includes(`media:${asset.id}`) ||
        serializedConfig.includes(asset.publicPath) ||
        serializedConfig.includes(absoluteAppAssetUrl(asset.publicPath)) ||
        serializedConfig.includes(asset.storagePath) ||
        serializedConfig.includes(asset.filename)
      ) {
        ids.add(asset.id);
      }
    }
  }

  return Array.from(ids);
}

export function collectRemoteImageSources(input: {
  articles: Array<{ markdown: string }>;
  funnels: Array<{ configJson: unknown }>;
}) {
  const sources = new Set<string>();
  for (const article of input.articles) {
    collectImageSourcesFromMarkdown(article.markdown, sources);
  }
  for (const funnel of input.funnels) {
    collectImageSourcesFromJson(funnel.configJson, sources);
  }
  return Array.from(sources).filter(isRemoteImageSource);
}

export async function replaceMarkdownMediaReferences(
  blogId: string,
  markdown: string,
  mediaMap: BuildMediaMap,
  imageSourceMap: BuildImageSourceMap = {}
) {
  if (!markdown) return markdown;
  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: { in: Object.keys(mediaMap) },
      OR: [{ blogId }, { blogId: null }],
    },
  });
  let output = markdown;
  for (const asset of assets) {
    const buildPath = mediaMap[asset.id];
    const references = [
      `media:${asset.id}`,
      asset.storagePath,
      `/${asset.storagePath}`,
      asset.publicPath,
      absoluteAppAssetUrl(asset.publicPath),
    ];
    for (const reference of references) {
      output = replaceReference(output, reference, buildPath);
    }
  }
  for (const [source, buildPath] of Object.entries(imageSourceMap)) {
    output = replaceReference(output, source, buildPath);
  }
  return output;
}

function replaceReference(value: string, reference: string, replacement: string) {
  if (!reference || reference === replacement) return value;
  const protectedPrefix = replacement.endsWith(reference) ? replacement.slice(0, -reference.length) : "";
  let output = "";
  let cursor = 0;

  while (cursor < value.length) {
    const match = value.indexOf(reference, cursor);
    if (match === -1) {
      output += value.slice(cursor);
      break;
    }

    const alreadyPrefixed =
      protectedPrefix &&
      match >= protectedPrefix.length &&
      value.slice(match - protectedPrefix.length, match) === protectedPrefix;

    output += value.slice(cursor, match);
    output += alreadyPrefixed ? reference : replacement;
    cursor = match + reference.length;
  }

  return output || value;
}

export async function fileBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}

export async function readMediaAssetBytes(id: string) {
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
  return readFile(path.resolve(storageDir(), asset.storagePath));
}

function collectMediaIdsFromJson(value: unknown, ids: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectMediaIdsFromJson(entry, ids));
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.imageMediaId === "string" && record.imageMediaId) {
      ids.add(record.imageMediaId);
    }
    Object.values(record).forEach((entry) => collectMediaIdsFromJson(entry, ids));
  }
}

function collectImageSourcesFromJson(value: unknown, sources: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectImageSourcesFromJson(entry, sources));
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.imageUrl === "string" && record.imageUrl) {
      sources.add(record.imageUrl);
    }
    Object.values(record).forEach((entry) => collectImageSourcesFromJson(entry, sources));
  }
}

function collectImageSourcesFromMarkdown(markdown: string, sources: Set<string>) {
  const markdownImagePattern = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of markdown.matchAll(markdownImagePattern)) {
    if (match[1]) sources.add(match[1]);
  }

  const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of markdown.matchAll(htmlImagePattern)) {
    if (match[1]) sources.add(match[1]);
  }
}

function isRemoteImageSource(source: string) {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function originalNameFromUrl(source: string, mimeType: string) {
  try {
    const url = new URL(source);
    const basename = path.basename(url.pathname);
    if (basename && basename !== "/" && basename.includes(".")) return basename;
    if (basename && basename !== "/") return `${basename}${extensionFor(basename, mimeType)}`;
  } catch {
    // Fall through to content-type-based default.
  }
  return `image${extensionFor("image", mimeType)}`;
}

function mimeTypeFromUrl(source: string) {
  try {
    const extension = path.extname(new URL(source).pathname).toLowerCase();
    if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
    if (extension === ".png") return "image/png";
    if (extension === ".webp") return "image/webp";
    if (extension === ".gif") return "image/gif";
    if (extension === ".svg") return "image/svg+xml";
  } catch {
    return null;
  }
  return null;
}

function absoluteAppAssetUrl(publicPath: string) {
  const normalizedPath = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${appUrl().replace(/\/$/, "")}${normalizedPath}`;
}

function extensionFor(originalName: string, mimeType: string) {
  const fromName = path.extname(originalName).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(fromName)) {
    return fromName === ".jpeg" ? ".jpg" : fromName;
  }
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  return "";
}
