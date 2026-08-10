import { AdminShell } from "@/components/admin/AdminShell";
import { DeploymentPanel } from "@/components/admin/DeploymentPanel";
import { listBlogs } from "@/modules/blogs/service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  const blogs = await listBlogs();
  const firstBlogId = blogs[0]?.id;
  const [builds, deployments] = firstBlogId
    ? await Promise.all([
        prisma.build.findMany({ where: { blogId: firstBlogId }, orderBy: { createdAt: "desc" }, take: 50 }),
        prisma.deployment.findMany({
          where: { blogId: firstBlogId },
          orderBy: { createdAt: "desc" },
          include: { target: true, build: true },
          take: 50,
        }),
      ])
    : [[], []];

  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Static output and remote upload</p>
          <h1 className="page-title">Deployments</h1>
        </div>
      </div>
      <DeploymentPanel
        initialBlogs={JSON.parse(JSON.stringify(blogs))}
        initialBuilds={JSON.parse(JSON.stringify(builds))}
        initialDeployments={JSON.parse(JSON.stringify(deployments))}
      />
    </AdminShell>
  );
}
