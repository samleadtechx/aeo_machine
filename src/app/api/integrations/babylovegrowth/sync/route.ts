import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { syncBabyLoveGrowth } from "@/modules/baby-love-growth/service";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await syncBabyLoveGrowth());
  } catch (error) {
    return apiError(error);
  }
}
