import { NextResponse } from "next/server";
import { ingestTrackingEventWebhook } from "@/modules/leads/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const rawBody = await request.text();
    await ingestTrackingEventWebhook((await params).publicId, rawBody, request.headers);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
