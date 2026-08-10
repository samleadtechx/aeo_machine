import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Prisma, PublicWebhookType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/encryption";
import { devFallbackEnv } from "@/lib/env";
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
    await queueTrackingEvents({
      blogId: endpoint.blogId,
      leadId: lead.id,
      eventName: "Lead",
      eventId: lead.eventId,
      sourceUrl: lead.sourceUrl,
      payload: {
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        answers: lead.answersJson,
        result: lead.resultJson,
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
  await queueTrackingEvents({
    blogId: endpoint.blogId,
    eventName,
    eventId,
    sourceUrl: stringValue(payload.source_url) || stringValue(payload.sourceUrl),
    payload,
  });
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
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as Prisma.InputJsonValue) : undefined;
}

function hashIp(value: string) {
  if (!value) return null;
  return createHash("sha256")
    .update(`${devFallbackEnv("PUBLIC_WEBHOOK_SECRET", "dev-public-webhook-secret")}:${value}`)
    .digest("hex");
}
