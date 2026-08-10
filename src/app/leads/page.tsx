import { AdminShell } from "@/components/admin/AdminShell";
import { LeadsTable } from "@/components/admin/LeadsTable";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    include: { blog: true, funnel: true, article: true, outboundDeliveries: true },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Captured submissions</p>
          <h1 className="page-title">Leads</h1>
        </div>
      </div>
      <LeadsTable initialLeads={JSON.parse(JSON.stringify(leads))} />
    </AdminShell>
  );
}
