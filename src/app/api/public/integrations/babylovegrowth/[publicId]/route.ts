import { NextResponse } from "next/server";
import { verifyBearerWebhook } from "@/modules/leads/webhook";
import { importBabyLoveGrowthArticle } from "@/modules/baby-love-growth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const rawBody = await request.text();
    const verification = await verifyBearerWebhook((await params).publicId, "BABYLOVEGROWTH", request.headers);
    const payload = JSON.parse(rawBody);
    const imported = await importBabyLoveGrowthArticle(verification.endpoint.blogId, payload);
    return NextResponse.json({ ok: true, importId: imported.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BabyLoveGrowth webhook failed.";
    const status = /bearer|token|secret|not found/i.test(message) ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
