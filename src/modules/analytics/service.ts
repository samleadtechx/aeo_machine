import type { AnalyticsEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson, maskSecret } from "@/lib/crypto/encryption";
import { devFallbackEnv } from "@/lib/env";
import { queueTrackingEvents } from "@/modules/tracking/service";
import { createHash } from "crypto";

const SETTINGS_CREDENTIAL_NAME = "Meta Pixel and analytics settings";

export type AnalyticsEventMap = {
  articleOpen: string;
  deepRead: string;
  lead: string;
};

export type AnalyticsSettingsJson = {
  trackingEnabled: boolean;
  deepReadScrollPercent: number;
  deepReadSeconds: number;
  eventMap: AnalyticsEventMap;
  pixelId: string;
  testEventCode: string;
};

export type AnalyticsBlogSetting = AnalyticsSettingsJson & {
  blogId: string;
  blogName: string;
  blogSlug: string;
  capiEnabled: boolean;
  hasAccessToken: boolean;
  maskedAccessToken: string;
  updatedAt: Date | null;
};

export type AnalyticsRenderSettings = AnalyticsSettingsJson & {
  capiEnabled: boolean;
};

export type RecordAnalyticsEventInput = {
  blogId: string;
  eventType: AnalyticsEventType;
  eventName: string;
  eventId: string;
  leadId?: string | null;
  articleId?: string | null;
  articleSlug?: string | null;
  sourceUrl?: string | null;
  landingUrl?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  ip?: string | null;
  utm?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  device?: Record<string, unknown> | null;
  request?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettingsJson = {
  trackingEnabled: false,
  deepReadScrollPercent: 70,
  deepReadSeconds: 45,
  eventMap: {
    articleOpen: "ViewContent",
    deepRead: "DeepRead",
    lead: "Lead",
  },
  pixelId: "",
  testEventCode: "",
};

export async function listAnalyticsSettings(): Promise<AnalyticsBlogSetting[]> {
  const [blogs, credentials] = await Promise.all([
    prisma.blog.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.integrationCredential.findMany({
      where: { provider: "META" },
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
    const settings = parseAnalyticsSettings(credential?.settingsJson);
    const accessToken = safeDecryptAccessToken(credential?.secretsEncryptedJson);
    return {
      blogId: blog.id,
      blogName: blog.name,
      blogSlug: blog.slug,
      ...settings,
      capiEnabled: Boolean(credential?.enabled && settings.pixelId && accessToken),
      hasAccessToken: Boolean(accessToken),
      maskedAccessToken: maskSecret(accessToken),
      updatedAt: credential?.updatedAt ?? null,
    };
  });
}

export async function getAnalyticsRenderSettings(blogId: string): Promise<AnalyticsRenderSettings> {
  const credential = await latestMetaCredential(blogId);
  const settings = parseAnalyticsSettings(credential?.settingsJson);
  const accessToken = safeDecryptAccessToken(credential?.secretsEncryptedJson);
  return {
    ...settings,
    capiEnabled: Boolean(credential?.enabled && settings.pixelId && accessToken),
  };
}

export async function saveAnalyticsSettings(input: {
  blogId: string;
  trackingEnabled?: boolean;
  deepReadScrollPercent?: number;
  deepReadSeconds?: number;
  eventMap?: Partial<AnalyticsEventMap>;
  pixelId?: string | null;
  accessToken?: string | null;
  testEventCode?: string | null;
}) {
  const blog = await prisma.blog.findUnique({
    where: { id: input.blogId },
    select: { id: true, name: true, slug: true },
  });
  if (!blog) throw new Error("Blog not found.");

  const existing = await latestMetaCredential(input.blogId);
  const current = parseAnalyticsSettings(existing?.settingsJson);
  const existingAccessToken = safeDecryptAccessToken(existing?.secretsEncryptedJson);
  const accessToken =
    typeof input.accessToken === "string" && input.accessToken.trim()
      ? input.accessToken.trim()
      : existingAccessToken;

  const settings: AnalyticsSettingsJson = {
    ...current,
    trackingEnabled: input.trackingEnabled ?? current.trackingEnabled,
    deepReadScrollPercent: normalizePercent(input.deepReadScrollPercent, current.deepReadScrollPercent),
    deepReadSeconds: normalizeSeconds(input.deepReadSeconds, current.deepReadSeconds),
    pixelId: normalizeText(input.pixelId, current.pixelId),
    testEventCode: normalizeText(input.testEventCode, current.testEventCode),
    eventMap: {
      articleOpen: normalizeEventName(input.eventMap?.articleOpen, current.eventMap.articleOpen),
      deepRead: normalizeEventName(input.eventMap?.deepRead, current.eventMap.deepRead),
      lead: normalizeEventName(input.eventMap?.lead, current.eventMap.lead),
    },
  };

  const providerEnabled = Boolean(settings.trackingEnabled && settings.pixelId && accessToken);
  const data = {
    provider: "META" as const,
    name: SETTINGS_CREDENTIAL_NAME,
    enabled: providerEnabled,
    settingsJson: settings as Prisma.InputJsonValue,
    secretsEncryptedJson: accessToken ? encryptJson({ accessToken }) : existing?.secretsEncryptedJson ?? null,
  };

  const credential = existing
    ? await prisma.integrationCredential.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.integrationCredential.create({
        data: {
          blogId: input.blogId,
          ...data,
        },
      });

  const saved = parseAnalyticsSettings(credential.settingsJson);
  const savedAccessToken = safeDecryptAccessToken(credential.secretsEncryptedJson);
  return {
    blogId: blog.id,
    blogName: blog.name,
    blogSlug: blog.slug,
    ...saved,
    capiEnabled: Boolean(credential.enabled && saved.pixelId && savedAccessToken),
    hasAccessToken: Boolean(savedAccessToken),
    maskedAccessToken: maskSecret(savedAccessToken),
    updatedAt: credential.updatedAt,
  } satisfies AnalyticsBlogSetting;
}

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {
  const articleId = input.articleId || (await findArticleId(input.blogId, input.articleSlug, input.sourceUrl));
  return prisma.analyticsEvent.upsert({
    where: {
      blogId_eventId_eventType: {
        blogId: input.blogId,
        eventId: input.eventId,
        eventType: input.eventType,
      },
    },
    create: {
      blogId: input.blogId,
      articleId,
      leadId: input.leadId || null,
      eventType: input.eventType,
      eventName: input.eventName,
      eventId: input.eventId,
      visitorId: input.visitorId || null,
      sessionId: input.sessionId || null,
      sourceUrl: input.sourceUrl || null,
      landingUrl: input.landingUrl || null,
      articleSlug: input.articleSlug || null,
      referrer: input.referrer || null,
      userAgent: input.userAgent || null,
      ipHash: hashIp(input.ip || ""),
      utmJson: jsonObject(input.utm),
      queryJson: jsonObject(input.query),
      deviceJson: jsonObject(input.device),
      requestJson: jsonObject(input.request),
      payloadJson: jsonObject(input.payload),
    },
    update: {
      articleId: articleId || undefined,
      leadId: input.leadId || undefined,
      articleSlug: input.articleSlug || undefined,
      sourceUrl: input.sourceUrl || undefined,
      landingUrl: input.landingUrl || undefined,
      referrer: input.referrer || undefined,
      userAgent: input.userAgent || undefined,
      visitorId: input.visitorId || undefined,
      sessionId: input.sessionId || undefined,
      utmJson: jsonObject(input.utm),
      queryJson: jsonObject(input.query),
      deviceJson: jsonObject(input.device),
      requestJson: jsonObject(input.request),
      payloadJson: jsonObject(input.payload),
    },
  });
}

export async function queueConfiguredTrackingEvent(input: {
  blogId: string;
  leadId?: string | null;
  eventType: AnalyticsEventType;
  eventName?: string | null;
  eventId: string;
  sourceUrl?: string | null;
  payload: Record<string, unknown>;
}) {
  const settings = await getAnalyticsRenderSettings(input.blogId);
  const eventName = input.eventName || eventNameForType(input.eventType, settings.eventMap);
  return queueTrackingEvents({
    blogId: input.blogId,
    leadId: input.leadId,
    eventName,
    eventId: input.eventId,
    sourceUrl: input.sourceUrl,
    payload: {
      ...input.payload,
      analyticsEventType: input.eventType,
    },
  });
}

export function eventNameForType(eventType: AnalyticsEventType, eventMap: AnalyticsEventMap) {
  if (eventType === "ARTICLE_OPEN") return eventMap.articleOpen;
  if (eventType === "DEEP_READ") return eventMap.deepRead;
  return eventMap.lead;
}

export function parseAnalyticsEventType(value: unknown): AnalyticsEventType | null {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (text === "ARTICLE_OPEN" || text === "ARTICLE_OPENED" || text === "OPEN") return "ARTICLE_OPEN";
  if (text === "DEEP_READ" || text === "DEEPREAD") return "DEEP_READ";
  if (text === "LEAD") return "LEAD";
  return null;
}

export function parseAnalyticsSettings(settingsJson: unknown): AnalyticsSettingsJson {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return DEFAULT_ANALYTICS_SETTINGS;
  }
  const settings = settingsJson as Record<string, unknown>;
  const eventMap = settings.eventMap && typeof settings.eventMap === "object" && !Array.isArray(settings.eventMap)
    ? (settings.eventMap as Record<string, unknown>)
    : {};
  return {
    trackingEnabled: settings.trackingEnabled === true,
    deepReadScrollPercent: normalizePercent(settings.deepReadScrollPercent, DEFAULT_ANALYTICS_SETTINGS.deepReadScrollPercent),
    deepReadSeconds: normalizeSeconds(settings.deepReadSeconds, DEFAULT_ANALYTICS_SETTINGS.deepReadSeconds),
    pixelId: normalizeText(settings.pixelId, ""),
    testEventCode: normalizeText(settings.testEventCode, ""),
    eventMap: {
      articleOpen: normalizeEventName(eventMap.articleOpen, DEFAULT_ANALYTICS_SETTINGS.eventMap.articleOpen),
      deepRead: normalizeEventName(eventMap.deepRead, DEFAULT_ANALYTICS_SETTINGS.eventMap.deepRead),
      lead: normalizeEventName(eventMap.lead, DEFAULT_ANALYTICS_SETTINGS.eventMap.lead),
    },
  };
}

async function latestMetaCredential(blogId: string) {
  return prisma.integrationCredential.findFirst({
    where: {
      blogId,
      provider: "META",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

async function findArticleId(blogId: string, articleSlug?: string | null, sourceUrl?: string | null) {
  const slug = articleSlug || slugFromSourceUrl(sourceUrl);
  if (!slug) return null;
  const article = await prisma.article.findFirst({
    where: { blogId, slug },
    select: { id: true },
  });
  return article?.id ?? null;
}

function slugFromSourceUrl(sourceUrl?: string | null) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const segments = url.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
    const last = segments.at(-1);
    if (!last) return null;
    return last.replace(/\.html$/i, "");
  } catch {
    return null;
  }
}

function normalizePercent(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(10, Math.min(100, Math.round(number)));
}

function normalizeSeconds(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(900, Math.round(number)));
}

function normalizeText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizeEventName(value: unknown, fallback: string) {
  const text = normalizeText(value, fallback);
  return text.replace(/[^\w:-]/g, "").slice(0, 80) || fallback;
}

function safeDecryptAccessToken(value: string | null | undefined) {
  try {
    const secrets = decryptJson<Record<string, string>>(value, {});
    return secrets.accessToken || "";
  } catch {
    return "";
  }
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : undefined;
}

function hashIp(value: string) {
  if (!value) return null;
  return createHash("sha256")
    .update(`${devFallbackEnv("PUBLIC_WEBHOOK_SECRET", "dev-public-webhook-secret")}:${value}`)
    .digest("hex");
}
