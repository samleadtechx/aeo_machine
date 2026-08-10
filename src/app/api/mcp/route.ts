import { NextResponse } from "next/server";
import { handleMcpToolCall } from "@/modules/mcp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const result = await handleMcpToolCall(request.headers.get("authorization"), await request.json());
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "MCP request failed" },
      { status: 400 }
    );
  }
}
