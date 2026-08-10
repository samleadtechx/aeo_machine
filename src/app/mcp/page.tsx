import { AdminShell } from "@/components/admin/AdminShell";
import { McpTokenManager } from "@/components/admin/McpTokenManager";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  const tokens = await prisma.mcpToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      enabled: true,
      permissionsJson: true,
      blogScopeJson: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Agent access</p>
          <h1 className="page-title">MCP</h1>
        </div>
      </div>
      <McpTokenManager initialTokens={JSON.parse(JSON.stringify(tokens))} />
    </AdminShell>
  );
}
