import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { deployBuild, latestSuccessfulBuild } from "@/modules/deployments/service";
import { buildBlogStaticSite } from "@/modules/rendering/site-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const build = body.buildId
      ? { id: String(body.buildId) }
      : body.rebuild
        ? await buildBlogStaticSite(id, "MANUAL")
        : await latestSuccessfulBuild(id);
    if (!build) throw new Error("No successful build exists for this blog.");
    const deployment = await deployBuild(build.id, {
      targetId: body.targetId ? String(body.targetId) : undefined,
      cleanRemoteRoot: Boolean(body.cleanRemoteRoot),
    });
    return NextResponse.json({ build, deployment });
  } catch (error) {
    return apiError(error);
  }
}
