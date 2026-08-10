import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const token = await prisma.mcpToken.update({
      where: { id: (await params).id },
      data: {
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
      },
    });
    return NextResponse.json({ token });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    await prisma.mcpToken.delete({ where: { id: (await params).id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
