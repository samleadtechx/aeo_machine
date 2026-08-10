import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { resendLeadOutboundWebhooks } from "@/modules/leads/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await resendLeadOutboundWebhooks((await params).id));
  } catch (error) {
    return apiError(error);
  }
}
