import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { deleteBlog, getBlog, updateBlog, upsertDeploymentTarget } from "@/modules/blogs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ blog: await getBlog((await params).id) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const blog = await updateBlog((await params).id, body.blog || body);
    const target = body.deploymentTarget
      ? await upsertDeploymentTarget((await params).id, body.deploymentTarget)
      : null;
    return NextResponse.json({ blog, target });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await deleteBlog((await params).id));
  } catch (error) {
    return apiError(error);
  }
}
