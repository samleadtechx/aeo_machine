import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { outboundWebhookPatchSchema } from "@/lib/validation/outbound-webhooks";
import { deleteOutboundWebhook, updateOutboundWebhook } from "@/modules/leads/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const webhook = await updateOutboundWebhook((await params).id, outboundWebhookPatchSchema.parse(await request.json()));
    return NextResponse.json({ webhook });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await deleteOutboundWebhook((await params).id));
  } catch (error) {
    return apiError(error);
  }
}
