import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const [builds, deployments] = await Promise.all([
    prisma.build.findMany({ where: { blogId: (await params).id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.deployment.findMany({
      where: { blogId: (await params).id },
      orderBy: { createdAt: "desc" },
      include: { build: true, target: true },
      take: 50,
    }),
  ]);
  return NextResponse.json({ builds, deployments });
}
