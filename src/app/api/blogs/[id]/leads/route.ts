import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const leads = await prisma.lead.findMany({
    where: { blogId: (await params).id },
    include: { blog: true, funnel: true, article: true, outboundDeliveries: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ leads });
}
