import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { createOpaqueToken, hashToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";
import { defaultMcpPermissions } from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

const tokenSchema = z.object({
  name: z.string().min(2),
  blogScopeJson: z
    .object({
      blogIds: z.array(z.string().min(1)).min(1),
    })
    .optional()
    .nullable(),
  permissionsJson: z.array(z.string()).default(defaultMcpPermissions),
});

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const tokens = await prisma.mcpToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      enabled: true,
      blogScopeJson: true,
      permissionsJson: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ tokens });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const input = tokenSchema.parse(await request.json());
    if (input.blogScopeJson?.blogIds?.length) {
      const count = await prisma.blog.count({
        where: { id: { in: input.blogScopeJson.blogIds } },
      });
      if (count !== input.blogScopeJson.blogIds.length) {
        throw new Error("One or more selected MCP blog scopes do not exist.");
      }
    }
    const token = createOpaqueToken("aeo_mcp");
    const record = await prisma.mcpToken.create({
      data: {
        name: input.name,
        tokenHash: hashToken(token),
        blogScopeJson: input.blogScopeJson as Prisma.InputJsonValue | undefined,
        permissionsJson: input.permissionsJson as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        enabled: true,
        blogScopeJson: true,
        permissionsJson: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ token, record }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
