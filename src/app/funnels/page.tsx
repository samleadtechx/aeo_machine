import { AdminShell } from "@/components/admin/AdminShell";
import { FunnelManager } from "@/components/funnels/FunnelManager";
import { listBlogs } from "@/modules/blogs/service";
import { listFunnels } from "@/modules/forms/service";

export const dynamic = "force-dynamic";

export default async function FunnelsPage() {
  const [blogs, funnels] = await Promise.all([listBlogs(), listFunnels()]);
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Quiz calculators</p>
          <h1 className="page-title">Funnels</h1>
        </div>
      </div>
      <FunnelManager initialBlogs={JSON.parse(JSON.stringify(blogs))} initialFunnels={JSON.parse(JSON.stringify(funnels))} />
    </AdminShell>
  );
}
