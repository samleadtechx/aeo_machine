import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BlogInput, DeploymentTargetInput } from "@/lib/validation/blogs";
import { blogInputSchema, deploymentTargetInputSchema } from "@/lib/validation/blogs";
import { encryptSecret } from "@/lib/crypto/encryption";
import { normalizeBaseUrl } from "@/lib/utils/url";

export async function listBlogs() {
  return prisma.blog.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          articles: true,
          funnels: true,
          leads: true,
          builds: true,
        },
      },
      deploymentTargets: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function getBlog(id: string) {
  return prisma.blog.findUnique({
    where: { id },
    include: {
      deploymentTargets: { orderBy: { createdAt: "desc" } },
      publicWebhookEndpoints: true,
      _count: { select: { articles: true, funnels: true, leads: true } },
    },
  });
}

export async function createBlog(input: BlogInput) {
  const data = blogInputSchema.parse({
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl),
  });
  const blog = await prisma.blog.create({
    data: {
      ...data,
      organizationName: data.organizationName || data.brandName,
    },
  });
  await ensurePublicWebhookEndpoint(blog.id, "LEAD_INGEST");
  await ensurePublicWebhookEndpoint(blog.id, "TRACKING_EVENT");
  await ensurePublicWebhookEndpoint(blog.id, "BABYLOVEGROWTH");
  return blog;
}

export async function updateBlog(id: string, input: Partial<BlogInput>) {
  const current = await prisma.blog.findUniqueOrThrow({ where: { id } });
  const parsed = blogInputSchema.partial().parse({
    ...input,
    baseUrl: input.baseUrl ? normalizeBaseUrl(input.baseUrl) : undefined,
  });
  return prisma.blog.update({
    where: { id },
    data: {
      ...parsed,
      brandName: parsed.brandName ?? current.brandName,
      organizationName: parsed.organizationName === undefined ? current.organizationName : parsed.organizationName,
    },
  });
}

export async function deleteBlog(id: string) {
  await prisma.blog.delete({ where: { id } });
  return { ok: true };
}

export async function upsertDeploymentTarget(blogId: string, input: DeploymentTargetInput) {
  const data = deploymentTargetInputSchema.parse(input);
  const latest = await prisma.deploymentTarget.findFirst({
    where: { blogId },
    orderBy: { createdAt: "desc" },
  });
  const encrypted = {
    passwordEncrypted: data.password ? encryptSecret(data.password) : latest?.passwordEncrypted ?? null,
    privateKeyEncrypted: data.privateKey ? encryptSecret(data.privateKey) : latest?.privateKeyEncrypted ?? null,
    privateKeyPassphraseEncrypted: data.privateKeyPassphrase
      ? encryptSecret(data.privateKeyPassphrase)
      : latest?.privateKeyPassphraseEncrypted ?? null,
  };
  const targetData: Prisma.DeploymentTargetUncheckedCreateInput = {
    blogId,
    type: data.type,
    host: data.host,
    port: data.port,
    username: data.username,
    remoteRootPath: data.remoteRootPath,
    cleanUrlMode: data.cleanUrlMode,
    phpEnabled: data.phpEnabled,
    htaccessEnabled: data.htaccessEnabled,
    ...encrypted,
  };
  if (!latest) {
    return prisma.deploymentTarget.create({ data: targetData });
  }
  return prisma.deploymentTarget.update({
    where: { id: latest.id },
    data: targetData,
  });
}

export async function deleteLatestDeploymentTarget(blogId: string) {
  const latest = await prisma.deploymentTarget.findFirst({
    where: { blogId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) throw new Error("No deployment target is saved for this blog.");
  await prisma.deploymentTarget.delete({ where: { id: latest.id } });
  return { ok: true };
}

export async function ensurePublicWebhookEndpoint(
  blogId: string,
  type: "LEAD_INGEST" | "TRACKING_EVENT" | "BABYLOVEGROWTH"
) {
  const existing = await prisma.publicWebhookEndpoint.findFirst({
    where: { blogId, type, enabled: true },
  });
  if (existing) return existing;
  return prisma.publicWebhookEndpoint.create({
    data: {
      blogId,
      type,
      publicId: `${type.toLowerCase().replace(/_/g, "-")}-${nanoid(18)}`,
      secretEncrypted: encryptSecret(nanoid(48))!,
    },
  });
}
