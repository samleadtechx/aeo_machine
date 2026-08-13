import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import {
  listBabyLoveGrowthSettings,
  setBabyLoveGrowthAutoPublish,
} from "@/modules/baby-love-growth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsPatchSchema = z.object({
  blogId: z.string().min(1),
  autoPublish: z.boolean(),
});

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ settings: await listBabyLoveGrowthSettings() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const input = settingsPatchSchema.parse(await request.json());
    const setting = await setBabyLoveGrowthAutoPublish(input.blogId, input.autoPublish);
    return NextResponse.json({ setting });
  } catch (error) {
    return apiError(error);
  }
}
