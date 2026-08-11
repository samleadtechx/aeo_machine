import { AdminShell } from "@/components/admin/AdminShell";
import { McpTokenManager } from "@/components/admin/McpTokenManager";
import { prisma } from "@/lib/prisma";
import { listBlogs } from "@/modules/blogs/service";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  const [tokens, blogs] = await Promise.all([
    prisma.mcpToken.findMany({
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
    }),
    listBlogs(),
  ]);
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Agent access</p>
          <h1 className="page-title">MCP</h1>
        </div>
      </div>
      <McpTokenManager
        initialTokens={JSON.parse(JSON.stringify(tokens))}
        initialBlogs={JSON.parse(JSON.stringify(blogs))}
      />
    </AdminShell>
  );
}
