import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { listAnalyticsSettings, saveAnalyticsSettings } from "@/modules/analytics/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventMapSchema = z.object({
  articleOpen: z.string().min(1).optional(),
  deepRead: z.string().min(1).optional(),
  lead: z.string().min(1).optional(),
});

const settingsPatchSchema = z.object({
  blogId: z.string().min(1),
  trackingEnabled: z.boolean().optional(),
  deepReadScrollPercent: z.coerce.number().min(10).max(100).optional(),
  deepReadSeconds: z.coerce.number().min(1).max(900).optional(),
  pixelId: z.string().optional(),
  accessToken: z.string().optional(),
  testEventCode: z.string().optional(),
  eventMap: eventMapSchema.optional(),
});

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ settings: await listAnalyticsSettings() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const input = settingsPatchSchema.parse(await request.json());
    const setting = await saveAnalyticsSettings(input);
    return NextResponse.json({ setting });
  } catch (error) {
    return apiError(error);
  }
}
