import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { deleteArticle, getArticle, updateArticle } from "@/modules/articles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ article: await getArticle((await params).id) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const article = await updateArticle((await params).id, await request.json());
    return NextResponse.json({ article });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await deleteArticle((await params).id));
  } catch (error) {
    return apiError(error);
  }
}
