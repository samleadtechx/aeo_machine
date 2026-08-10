import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { readMediaAssetBytes } from "@/modules/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
  }
  const bytes = await readMediaAssetBytes(id);
  return new Response(bytes, {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
