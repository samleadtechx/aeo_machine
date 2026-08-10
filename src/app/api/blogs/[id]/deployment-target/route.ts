import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { deleteLatestDeploymentTarget } from "@/modules/blogs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await deleteLatestDeploymentTarget((await params).id));
  } catch (error) {
    return apiError(error);
  }
}
