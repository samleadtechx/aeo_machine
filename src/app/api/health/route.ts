import { mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageDir } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storageRoot = path.resolve(storageDir());
    await Promise.all([
      mkdir(path.join(storageRoot, "media"), { recursive: true }),
      mkdir(path.join(storageRoot, "builds"), { recursive: true }),
      mkdir(path.join(storageRoot, "tmp"), { recursive: true }),
    ]);
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      storageDir: storageRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
