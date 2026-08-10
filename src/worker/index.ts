import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildBlogStaticSite } from "@/modules/rendering/site-renderer";
import { deployBuild } from "@/modules/deployments/service";
import { runAndPersistSeoAudit } from "@/modules/articles/service";
import { sendPendingOutboundWebhooks } from "@/modules/leads/outbound";
import { sendPendingTrackingEvents } from "@/modules/tracking/service";

const workerId = `worker-${randomUUID()}`;
const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_MS || 2000);

async function tick() {
  const job = await prisma.job.findFirst({
    where: {
      status: "QUEUED",
      runAfter: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!job) {
    await sendPendingOutboundWebhooks(10);
    await sendPendingTrackingEvents(10);
    return;
  }
  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      attempts: { increment: 1 },
    },
  });
  if (claimed.count === 0) return;

  try {
    const payload = job.payloadJson as Record<string, unknown>;
    if (job.type === "BUILD_BLOG") {
      await buildBlogStaticSite(String(payload.blogId), "MANUAL");
    } else if (job.type === "DEPLOY_BUILD") {
      await deployBuild(String(payload.buildId), payload.targetId ? String(payload.targetId) : undefined);
    } else if (job.type === "SEO_AUDIT_ARTICLE") {
      await runAndPersistSeoAudit(String(payload.articleId));
    } else if (job.type === "SEND_OUTBOUND_WEBHOOK") {
      await sendPendingOutboundWebhooks(25);
    } else if (job.type === "SEND_CONVERSION_EVENT") {
      await sendPendingTrackingEvents(25);
    } else if (job.type === "BABYLOVEGROWTH_SYNC") {
      console.log("BabyLoveGrowth sync job is queued; configure API credentials to implement pull sync.");
    } else {
      throw new Error(`Unknown job type ${job.type}`);
    }
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "SUCCESS", lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: job.attempts + 1 >= job.maxAttempts ? "FAILED" : "QUEUED",
        lastError: message,
        runAfter: new Date(Date.now() + Math.min(60_000, 2 ** job.attempts * 2000)),
      },
    });
  }
}

async function main() {
  console.log(`AEO Machine worker started: ${workerId}`);
  for (;;) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
