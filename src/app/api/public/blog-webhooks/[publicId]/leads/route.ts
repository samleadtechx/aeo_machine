import { NextResponse } from "next/server";
import { ingestLeadWebhook } from "@/modules/leads/webhook";
import { queueOutboundWebhooks } from "@/modules/leads/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const rawBody = await request.text();
    const lead = await ingestLeadWebhook((await params).publicId, rawBody, request.headers);
    await queueOutboundWebhooks(lead.id);
    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
