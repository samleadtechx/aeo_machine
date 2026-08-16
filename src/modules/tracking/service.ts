import type { IntegrationProvider, Prisma, TrackingProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { providers } from "@/modules/tracking/providers";

const conversionProviders: IntegrationProvider[] = ["META", "TIKTOK", "REDDIT", "OPENAI_ADS"];

export async function queueTrackingEvents(input: {
  blogId: string;
  leadId?: string | null;
  eventName: string;
  eventId: string;
  sourceUrl?: string | null;
  payload: Record<string, unknown>;
}) {
  const credentials = await prisma.integrationCredential.findMany({
    where: {
      blogId: input.blogId,
      provider: { in: conversionProviders },
      enabled: true,
    },
  });
  if (credentials.length === 0) return [];
  const events = await Promise.all(
    credentials.map((credential) =>
      prisma.trackingEvent.upsert({
        where: {
          provider_eventId_eventName: {
            provider: credential.provider as TrackingProvider,
            eventId: input.eventId,
            eventName: input.eventName,
          },
        },
        create: {
          blogId: input.blogId,
          leadId: input.leadId,
          provider: credential.provider as TrackingProvider,
          eventName: input.eventName,
          eventId: input.eventId,
          sourceUrl: input.sourceUrl,
          payloadJson: input.payload as Prisma.InputJsonValue,
        },
        update: {},
      })
    )
  );
  if (events.length > 0) {
    await prisma.job.create({
      data: {
        type: "SEND_CONVERSION_EVENT",
        payloadJson: {
          blogId: input.blogId,
          eventName: input.eventName,
          eventId: input.eventId,
        },
      },
    });
  }
  return events;
}

export async function sendPendingTrackingEvents(limit = 25) {
  const events = await prisma.trackingEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { blog: true },
  });
  for (const event of events) {
    const credential = await prisma.integrationCredential.findFirst({
      where: {
        blogId: event.blogId,
        provider: event.provider,
        enabled: true,
      },
    });
    if (!credential) {
      await prisma.trackingEvent.update({
        where: { id: event.id },
        data: { status: "SKIPPED", lastError: "No enabled provider credential" },
      });
      continue;
    }
    const adapter = providers[event.provider];
    const result = await adapter.send(event, credential);
    await prisma.trackingEvent.update({
      where: { id: event.id },
      data: result.ok
        ? { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null }
        : { status: "FAILED", attempts: { increment: 1 }, lastError: result.error || "Provider send failed" },
    });
  }
}
