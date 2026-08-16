import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Prisma, PublicWebhookType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/encryption";
import { devFallbackEnv } from "@/lib/env";
import {
  parseAnalyticsEventType,
  queueConfiguredTrackingEvent,
  recordAnalyticsEvent,
} from "@/modules/analytics/service";
import { queueTrackingEvents } from "@/modules/tracking/service";

export type WebhookVerification = {
  endpoint: {
    id: string;
    blogId: string;
    publicId: string;
    secretEncrypted: string;
  };
  secret: string;
};

export async function verifySignedWebhook(
  publicId: string,
  type: PublicWebhookType,
  rawBody: string,
  headers: Headers
): Promise<WebhookVerification> {
  const endpoint = await prisma.publicWebhookEndpoint.findFirst({
    where: { publicId, type, enabled: true },
    select: { id: true, blogId: true, publicId: true, secretEncrypted: true },
  });
  if (!endpoint) throw new Error("Webhook endpoint not found.");
  const secret = decryptSecret(endpoint.secretEncrypted);
  if (!secret) throw new Error("Webhook secret missing.");

  const timestampHeader = headers.get("x-aeo-timestamp");
  const signature = headers.get("x-aeo-signature") || "";
  const timestamp = Number(timestampHeader);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    throw new Error("Webhook timestamp rejected.");
  }
  const expected = createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`).digest("hex");
  if (!safeCompare(signature, expected)) {
    throw new Error("Webhook signature rejected.");
  }
  return { endpoint, secret };
}

export async function verifyBearerWebhook(
  publicId: string,
  type: PublicWebhookType,
  headers: Headers
): Promise<WebhookVerification> {
  const endpoint = await prisma.publicWebhookEndpoint.findFirst({
    where: { publicId, type, enabled: true },
    select: { id: true, blogId: true, publicId: true, secretEncrypted: true },
  });
  if (!endpoint) throw new Error("Webhook endpoint not found.");
  const secret = decryptSecret(endpoint.secretEncrypted);
  if (!secret) throw new Error("Webhook secret missing.");

  const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!token || !safeCompareText(token, secret)) {
    throw new Error("Webhook bearer token rejected.");
  }
  return { endpoint, secret };
}

export async function ingestLeadWebhook(publicId: string, rawBody: string, headers: Headers) {
  const { endpoint } = await verifySignedWebhook(publicId, "LEAD_INGEST", rawBody, headers);
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const remoteSubmissionId = String(payload.remoteSubmissionId || "");
  if (!remoteSubmissionId) throw new Error("remoteSubmissionId is required.");

  const funnelSlug = stringValue(payload.funnelSlug);
  const articleSlug = stringValue(payload.articleSlug);
  const funnel = funnelSlug
    ? await prisma.funnel.findFirst({ where: { blogId: endpoint.blogId, slug: funnelSlug } })
    : null;
  const article = articleSlug
    ? await prisma.article.findFirst({ where: { blogId: endpoint.blogId, slug: articleSlug } })
    : null;

  const lead = await prisma.lead.upsert({
    where: {
      blogId_remoteSubmissionId: {
        blogId: endpoint.blogId,
        remoteSubmissionId,
      },
    },
    create: {
      blogId: endpoint.blogId,
      funnelId: funnel?.id,
      articleId: article?.id,
      remoteSubmissionId,
      email: stringValue(payload.email),
      phone: stringValue(payload.phone),
      name: stringValue(payload.name),
      fieldsJson: objectValue(payload.fields),
      answersJson: objectValue(payload.answers),
      resultJson: objectValue(payload.result),
      resultText: stringValue(payload.resultText),
      utmJson: objectValue(payload.utm),
      trackingJson: objectValue(payload.tracking),
      ipHash: hashIp(headers.get("x-forwarded-for") || ""),
      userAgent: stringValue(payload.userAgent) || headers.get("user-agent"),
      referrer: stringValue(payload.referrer),
      sourceUrl: stringValue(payload.sourceUrl),
      eventId: stringValue(payload.eventId),
    },
    update: {},
  });

  if (lead.eventId) {
    const tracking = objectRecord(payload.tracking);
    const leadEventName = stringValue(payload.eventName) || stringValue(payload.event_name);
    await recordAnalyticsEvent({
      blogId: endpoint.blogId,
      leadId: lead.id,
      articleId: article?.id,
      articleSlug,
      eventType: "LEAD",
      eventName: leadEventName || "Lead",
      eventId: lead.eventId,
      sourceUrl: lead.sourceUrl,
      landingUrl: stringValue(tracking?.landingUrl),
      referrer: lead.referrer,
      userAgent: lead.userAgent,
      visitorId: stringValue(tracking?.visitorId),
      sessionId: stringValue(tracking?.sessionId),
      ip: headers.get("x-forwarded-for") || "",
      utm: objectRecord(payload.utm),
      query: objectRecord(tracking?.query),
      device: objectRecord(tracking?.device),
      request: objectRecord(tracking?.request),
      payload: {
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        answers: lead.answersJson,
        result: lead.resultJson,
      },
    });
    await queueConfiguredTrackingEvent({
      blogId: endpoint.blogId,
      leadId: lead.id,
      eventType: "LEAD",
      eventName: leadEventName,
      eventId: lead.eventId,
      sourceUrl: lead.sourceUrl,
      payload: {
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        answers: lead.answersJson,
        result: lead.resultJson,
        userAgent: lead.userAgent,
        referrer: lead.referrer,
        articleSlug,
        funnelSlug,
      },
    });
  }

  return lead;
}

export async function ingestTrackingEventWebhook(publicId: string, rawBody: string, headers: Headers) {
  const { endpoint } = await verifySignedWebhook(publicId, "TRACKING_EVENT", rawBody, headers);
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const eventName = stringValue(payload.event_name) || stringValue(payload.eventName) || "PageView";
  const eventId = stringValue(payload.event_id) || stringValue(payload.eventId);
  if (!eventId) throw new Error("event_id is required.");

  const eventType = parseAnalyticsEventType(payload.event_type || payload.eventType);
  const sourceUrl = stringValue(payload.source_url) || stringValue(payload.sourceUrl);
  if (eventType) {
    const server = objectRecord(payload.server);
    await recordAnalyticsEvent({
      blogId: endpoint.blogId,
      eventType,
      eventName,
      eventId,
      articleSlug: stringValue(payload.article_slug) || stringValue(payload.articleSlug),
      sourceUrl,
      landingUrl: stringValue(payload.landing_url) || stringValue(payload.landingUrl),
      referrer: stringValue(payload.referrer) || stringValue(server?.HTTP_REFERER),
      userAgent: stringValue(payload.userAgent) || headers.get("user-agent") || stringValue(server?.HTTP_USER_AGENT),
      visitorId: stringValue(payload.visitor_id) || stringValue(payload.visitorId),
      sessionId: stringValue(payload.session_id) || stringValue(payload.sessionId),
      ip: headers.get("x-forwarded-for") || stringValue(server?.REMOTE_ADDR) || "",
      utm: objectRecord(payload.utm),
      query: objectRecord(payload.query),
      device: objectRecord(payload.device),
      request: {
        ...(objectRecord(payload.request) || {}),
        ...(server || {}),
      },
      payload,
    });
    await queueConfiguredTrackingEvent({
      blogId: endpoint.blogId,
      eventType,
      eventName,
      eventId,
      sourceUrl,
      payload,
    });
  } else {
    await queueTrackingEvents({
      blogId: endpoint.blogId,
      eventName,
      eventId,
      sourceUrl,
      payload,
    });
  }
  return { ok: true };
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeCompareText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stringValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as Prisma.InputJsonValue) : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function hashIp(value: string) {
  if (!value) return null;
  return createHash("sha256")
    .update(`${devFallbackEnv("PUBLIC_WEBHOOK_SECRET", "dev-public-webhook-secret")}:${value}`)
    .digest("hex");
}
