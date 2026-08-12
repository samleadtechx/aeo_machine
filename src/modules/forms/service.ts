import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { defaultFunnelConfig } from "@/modules/forms/default-funnel";
import { funnelInputSchema, placementRuleInputSchema, type FunnelInput } from "@/lib/validation/funnels";
import { ensureSlug } from "@/lib/utils/slugify";

export async function listFunnels(blogId?: string) {
  return prisma.funnel.findMany({
    where: blogId ? { blogId } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      blog: { select: { name: true, slug: true } },
      placementRules: { orderBy: { priority: "asc" } },
      _count: { select: { leads: true } },
    },
  });
}

export async function getFunnel(id: string) {
  return prisma.funnel.findUnique({
    where: { id },
    include: { blog: true, placementRules: true },
  });
}

export async function createFunnel(blogId: string, input: Partial<FunnelInput>) {
  const parsed = funnelInputSchema.parse({
    name: input.name || "Lead Value Quiz",
    slug: ensureSlug(input.slug || input.name || "lead-value-quiz"),
    status: input.status || "DRAFT",
    configJson: input.configJson || defaultFunnelConfig,
    styleJson: input.styleJson || {},
    trackingJson: input.trackingJson || {},
  });
  return prisma.funnel.create({
    data: {
      blogId,
      name: parsed.name,
      slug: parsed.slug,
      status: parsed.status,
      configJson: parsed.configJson as unknown as Prisma.InputJsonValue,
      styleJson: (parsed.styleJson || {}) as Prisma.InputJsonValue,
      trackingJson: (parsed.trackingJson || {}) as Prisma.InputJsonValue,
    },
  });
}

export async function updateFunnel(id: string, input: Partial<FunnelInput>) {
  const existing = await prisma.funnel.findUniqueOrThrow({ where: { id } });
  const parsed = funnelInputSchema.parse({
    name: input.name ?? existing.name,
    slug: ensureSlug(input.slug ?? existing.slug),
    status: input.status ?? existing.status,
    configJson: input.configJson ?? existing.configJson,
    styleJson: input.styleJson ?? existing.styleJson ?? {},
    trackingJson: input.trackingJson ?? existing.trackingJson ?? {},
  });
  return prisma.funnel.update({
    where: { id },
    data: {
      name: parsed.name,
      slug: parsed.slug,
      status: parsed.status,
      configJson: parsed.configJson as unknown as Prisma.InputJsonValue,
      styleJson: (parsed.styleJson || {}) as Prisma.InputJsonValue,
      trackingJson: (parsed.trackingJson || {}) as Prisma.InputJsonValue,
    },
  });
}

export async function deleteFunnel(id: string) {
  await prisma.funnel.delete({ where: { id } });
  return { ok: true };
}

export async function upsertPlacementRule(funnelId: string, input: unknown) {
  const funnel = await prisma.funnel.findUniqueOrThrow({ where: { id: funnelId } });
  if (!funnel.blogId) throw new Error("Placement rules require a blog-scoped funnel.");
  const parsed = placementRuleInputSchema.parse(input);
  return prisma.funnelPlacementRule.create({
    data: {
      blogId: funnel.blogId,
      funnelId,
      name: parsed.name,
      enabled: parsed.enabled,
      matchMode: parsed.matchMode,
      tagSlugsJson: parsed.tagSlugs,
      placement: parsed.placement,
      priority: parsed.priority,
    },
  });
}
