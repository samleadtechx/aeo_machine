import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { getFunnel, updateFunnel } from "@/modules/forms/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ funnel: await getFunnel((await params).id) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ funnel: await updateFunnel((await params).id, await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}
