import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { createArticle, listArticles } from "@/modules/articles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ articles: await listArticles((await params).id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const article = await createArticle((await params).id, await request.json());
    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
