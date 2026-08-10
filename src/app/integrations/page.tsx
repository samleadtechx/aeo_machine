import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const credentials = await prisma.integrationCredential.findMany({
    include: { blog: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Imports and conversion APIs</p>
          <h1 className="page-title">Integrations</h1>
        </div>
      </div>
      <section className="panel panel-pad stack">
        <div className="notice">
          Provider records are scaffolded with encrypted secret storage. Meta has a concrete server send adapter; TikTok, Reddit, and OpenAI Ads are isolated behind adapter stubs for provider-specific QA.
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider</th>
              <th>Blog</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((credential) => (
              <tr key={credential.id}>
                <td>{credential.name}</td>
                <td>{credential.provider}</td>
                <td>{credential.blog?.name || "Global"}</td>
                <td><span className={`badge ${credential.enabled ? "pass" : "warn"}`}>{credential.enabled ? "Enabled" : "Disabled"}</span></td>
              </tr>
            ))}
            {credentials.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">No integration credentials yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
