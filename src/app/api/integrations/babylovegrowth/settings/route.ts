import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import {
  listBabyLoveGrowthSettings,
  setBabyLoveGrowthSettings,
} from "@/modules/baby-love-growth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsPatchSchema = z.object({
  blogId: z.string().min(1),
  autoPublish: z.boolean().optional(),
  defaultTags: z.array(z.string()).optional(),
}).refine((input) => input.autoPublish !== undefined || input.defaultTags !== undefined, {
  message: "At least one BabyLoveGrowth setting is required.",
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
    const setting = await setBabyLoveGrowthSettings(input.blogId, {
      autoPublish: input.autoPublish,
      defaultTags: input.defaultTags,
    });
    return NextResponse.json({ setting });
  } catch (error) {
    return apiError(error);
  }
}
