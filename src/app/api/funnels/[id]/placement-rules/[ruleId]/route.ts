import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { deletePlacementRule, updatePlacementRule } from "@/modules/forms/service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const { id, ruleId } = await params;
    return NextResponse.json({ rule: await updatePlacementRule(id, ruleId, await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const { id, ruleId } = await params;
    return NextResponse.json(await deletePlacementRule(id, ruleId));
  } catch (error) {
    return apiError(error);
  }
}
