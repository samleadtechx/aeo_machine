import { createHmac, randomBytes } from "crypto";
import type { Lead, OutboundWebhook, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from "@/lib/crypto/encryption";
import type { OutboundWebhookInput } from "@/lib/validation/outbound-webhooks";
import { formatHeaderLines } from "@/lib/validation/outbound-webhooks";

export async function queueOutboundWebhooks(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const webhooks = await prisma.outboundWebhook.findMany({
    where: {
      enabled: true,
      OR: [{ blogId: lead.blogId }, { blogId: null }],
    },
  });
  if (webhooks.length === 0) return 0;

  const existingDeliveries = await prisma.outboundWebhookDelivery.findMany({
    where: {
      leadId,
      outboundWebhookId: { in: webhooks.map((webhook) => webhook.id) },
    },
    select: { outboundWebhookId: true },
  });
  const existingWebhookIds = new Set(existingDeliveries.map((delivery) => delivery.outboundWebhookId));
  const newWebhooks = webhooks.filter((webhook) => !existingWebhookIds.has(webhook.id));
  if (newWebhooks.length === 0) return 0;

  const created = await prisma.outboundWebhookDelivery.createMany({
    data: newWebhooks.map((webhook) => ({
      outboundWebhookId: webhook.id,
      leadId,
      status: "PENDING",
    })),
  });
  if (created.count > 0) {
    await prisma.job.create({
      data: {
        type: "SEND_OUTBOUND_WEBHOOK",
        payloadJson: { leadId },
      },
    });
  }
  return created.count;
}

export async function sendPendingOutboundWebhooks(limit = 25) {
  const deliveries = await prisma.outboundWebhookDelivery.findMany({
    where: { status: "PENDING" },
    include: {
      outboundWebhook: true,
      lead: { include: { blog: true, funnel: true, article: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const delivery of deliveries) {
    const webhook = delivery.outboundWebhook;
    try {
      const payload = leadPayload(delivery.lead);
      const result = await sendOutboundWebhook(webhook, payload);
      await prisma.outboundWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: result.ok ? "SENT" : "FAILED",
          attempts: { increment: 1 },
          requestJson: payload,
          responseStatus: result.status,
          responseBody: result.body.slice(0, 4000),
          lastError: result.ok ? null : result.body.slice(0, 4000),
          sentAt: result.ok ? new Date() : null,
        },
      });
    } catch (error) {
      await markDeliveryFailed(delivery.id, error instanceof Error ? error.message : "Webhook send failed");
    }
  }
}

export async function listOutboundWebhooks() {
  const webhooks = await prisma.outboundWebhook.findMany({
    include: { blog: { select: { id: true, name: true, slug: true } }, deliveries: { take: 5, orderBy: { createdAt: "desc" } } },
    orderBy: [{ blogId: "asc" }, { createdAt: "desc" }],
  });
  return webhooks.map((webhook) => {
    const headers = decryptJson<Record<string, string>>(webhook.headersEncryptedJson, {});
    const signingSecret = decryptSecret(webhook.secretEncrypted) || "";
    return {
      id: webhook.id,
      blogId: webhook.blogId,
      blog: webhook.blog,
      name: webhook.name,
      enabled: webhook.enabled,
      url: decryptSecret(webhook.urlEncrypted) || "",
      method: webhook.method,
      headers,
      headersText: formatHeaderLines(headers),
      signingSecret,
      eventTypes: webhook.eventTypesJson,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
      recentDeliveries: webhook.deliveries,
    };
  });
}

export async function createOutboundWebhook(input: OutboundWebhookInput) {
  await assertBlogScope(input.blogId);
  return serializeOutboundWebhook(
    await prisma.outboundWebhook.create({
      data: outboundWebhookCreateData(input),
      include: { blog: { select: { id: true, name: true, slug: true } }, deliveries: { take: 5, orderBy: { createdAt: "desc" } } },
    })
  );
}

export async function updateOutboundWebhook(id: string, input: Partial<OutboundWebhookInput>) {
  if ("blogId" in input) await assertBlogScope(input.blogId);
  return serializeOutboundWebhook(
    await prisma.outboundWebhook.update({
      where: { id },
      data: outboundWebhookUpdateData(input),
      include: { blog: { select: { id: true, name: true, slug: true } }, deliveries: { take: 5, orderBy: { createdAt: "desc" } } },
    })
  );
}

export async function deleteOutboundWebhook(id: string) {
  await prisma.outboundWebhook.delete({ where: { id } });
  return { ok: true };
}

export async function testOutboundWebhook(id: string) {
  const webhook = await prisma.outboundWebhook.findUniqueOrThrow({
    where: { id },
    include: { blog: { select: { id: true, name: true, slug: true, baseUrl: true } } },
  });
  return sendOutboundWebhook(webhook, {
    event: "lead.test",
    lead: {
      id: "test_lead",
      blogId: webhook.blogId,
      blogName: webhook.blog?.name || "Global",
      funnelId: null,
      funnelName: "Test Funnel",
      articleId: null,
      articleTitle: "Test Article",
      email: "lead@example.com",
      phone: "+15555550123",
      name: "Example Lead",
      fields: { email: "lead@example.com", source: "outbound webhook test" },
      answers: { owner: "owner" },
      result: { qualified: true },
      resultText: "Outbound webhook test payload",
      sourceUrl: webhook.blog?.baseUrl || null,
      referrer: null,
      eventId: "test_event",
      createdAt: new Date().toISOString(),
    },
  });
}

export async function resendLeadOutboundWebhooks(leadId: string) {
  const queued = await queueOutboundWebhooks(leadId);
  await prisma.outboundWebhookDelivery.updateMany({
    where: { leadId, status: "FAILED" },
    data: { status: "PENDING", lastError: null },
  });
  await prisma.job.create({
    data: {
      type: "SEND_OUTBOUND_WEBHOOK",
      payloadJson: { leadId, resend: true },
    },
  });
  return { queued };
}

export async function sendOutboundWebhook(webhook: OutboundWebhook, payload: Prisma.InputJsonValue) {
  const url = decryptSecret(webhook.urlEncrypted);
  if (!url) throw new Error("Webhook URL missing");
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = decryptSecret(webhook.secretEncrypted) || "";
  const headers = {
    "Content-Type": "application/json",
    ...decryptJson<Record<string, string>>(webhook.headersEncryptedJson, {}),
    "X-AEO-Timestamp": timestamp,
    "X-AEO-Signature": secret ? createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex") : "",
  };
  const response = await fetch(url, {
    method: webhook.method,
    headers,
    body,
  });
  return {
    ok: response.ok,
    status: response.status,
    body: await response.text(),
  };
}

async function markDeliveryFailed(id: string, lastError: string) {
  await prisma.outboundWebhookDelivery.update({
    where: { id },
    data: {
      status: "FAILED",
      attempts: { increment: 1 },
      lastError,
    },
  });
}

function outboundWebhookCreateData(input: OutboundWebhookInput): Prisma.OutboundWebhookUncheckedCreateInput {
  return {
    blogId: input.blogId || null,
    name: input.name,
    enabled: input.enabled,
    urlEncrypted: encryptSecret(input.url) || "",
    method: input.method,
    headersEncryptedJson: encryptJson(input.headers),
    secretEncrypted: encryptSecret(input.signingSecret || randomBytes(24).toString("hex")),
    eventTypesJson: ["lead.created"],
  };
}

function outboundWebhookUpdateData(input: Partial<OutboundWebhookInput>): Prisma.OutboundWebhookUncheckedUpdateInput {
  const data: Prisma.OutboundWebhookUncheckedUpdateInput = {};
  if ("blogId" in input) data.blogId = input.blogId || null;
  if ("name" in input && input.name !== undefined) data.name = input.name;
  if ("enabled" in input && input.enabled !== undefined) data.enabled = input.enabled;
  if ("url" in input && input.url !== undefined) data.urlEncrypted = encryptSecret(input.url) || "";
  if ("method" in input && input.method !== undefined) data.method = input.method;
  if ("headers" in input && input.headers !== undefined) data.headersEncryptedJson = encryptJson(input.headers);
  if ("signingSecret" in input) data.secretEncrypted = encryptSecret(input.signingSecret || null);
  return data;
}

async function assertBlogScope(blogId: string | null | undefined) {
  if (!blogId) return;
  await prisma.blog.findUniqueOrThrow({ where: { id: blogId } });
}

async function serializeOutboundWebhook(
  webhook: OutboundWebhook & {
    blog?: { id: string; name: string; slug: string } | null;
    deliveries?: unknown[];
  }
) {
  const headers = decryptJson<Record<string, string>>(webhook.headersEncryptedJson, {});
  return {
    id: webhook.id,
    blogId: webhook.blogId,
    blog: webhook.blog || null,
    name: webhook.name,
    enabled: webhook.enabled,
    url: decryptSecret(webhook.urlEncrypted) || "",
    method: webhook.method,
    headers,
    headersText: formatHeaderLines(headers),
    signingSecret: decryptSecret(webhook.secretEncrypted) || "",
    eventTypes: webhook.eventTypesJson,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    recentDeliveries: webhook.deliveries || [],
  };
}

function leadPayload(
  lead: Lead & {
    blog?: { id: string; name: string; slug: string } | null;
    funnel?: { id: string; name: string; slug: string } | null;
    article?: { id: string; title: string; slug: string } | null;
  }
) {
  return {
    event: "lead.created",
    lead: {
      id: lead.id,
      blogId: lead.blogId,
      blogName: lead.blog?.name,
      funnelId: lead.funnelId,
      funnelName: lead.funnel?.name,
      articleId: lead.articleId,
      articleTitle: lead.article?.title,
      remoteSubmissionId: lead.remoteSubmissionId,
      email: lead.email,
      phone: lead.phone,
      name: lead.name,
      fields: lead.fieldsJson,
      answers: lead.answersJson,
      result: lead.resultJson,
      resultText: lead.resultText,
      utm: lead.utmJson,
      tracking: lead.trackingJson,
      sourceUrl: lead.sourceUrl,
      referrer: lead.referrer,
      eventId: lead.eventId,
      qualifiedStatus: lead.qualifiedStatus,
      createdAt: lead.createdAt.toISOString(),
    },
  };
}
