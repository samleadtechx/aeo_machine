import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { buildBlogStaticSite } from "@/modules/rendering/site-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const build = await buildBlogStaticSite((await params).id, "MANUAL");
    return NextResponse.json({ build });
  } catch (error) {
    return apiError(error);
  }
}
