import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { createMediaAsset, fileBuffer, listMediaAssets } from "@/modules/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ media: await listMediaAssets((await params).id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Image file is required.");
    }
    const media = await createMediaAsset({
      blogId: (await params).id,
      originalName: file.name,
      mimeType: file.type,
      bytes: await fileBuffer(file),
      altText: typeof form.get("altText") === "string" ? String(form.get("altText")) : null,
      role: form.get("role") === "logo" ? "logo" : "article",
    });
    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
