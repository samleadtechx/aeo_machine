import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";

export async function requireAdminApi() {
  try {
    return { user: await requireAdmin(), response: null };
  } catch {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}

export function apiError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json({ error: message }, { status });
}
