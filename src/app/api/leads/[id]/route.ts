import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const lead = await prisma.lead.findUnique({
    where: { id: (await params).id },
    include: { blog: true, funnel: true, article: true, outboundDeliveries: true, trackingEvents: true },
  });
  return NextResponse.json({ lead });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const lead = await prisma.lead.update({
      where: { id: (await params).id },
      data: { qualifiedStatus: body.qualifiedStatus },
    });
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}
