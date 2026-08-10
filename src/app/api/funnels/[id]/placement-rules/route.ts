import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { upsertPlacementRule } from "@/modules/forms/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ rule: await upsertPlacementRule((await params).id, await request.json()) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
