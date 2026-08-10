import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { outboundWebhookInputSchema } from "@/lib/validation/outbound-webhooks";
import { createOutboundWebhook, listOutboundWebhooks } from "@/modules/leads/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ webhooks: await listOutboundWebhooks() });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const webhook = await createOutboundWebhook(outboundWebhookInputSchema.parse(await request.json()));
    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
