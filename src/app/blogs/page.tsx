import { AdminShell } from "@/components/admin/AdminShell";
import { BlogManager } from "@/components/blogs/BlogManager";
import { listBlogs } from "@/modules/blogs/service";

export const dynamic = "force-dynamic";

export default async function BlogsPage() {
  const blogs = await listBlogs();
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Domains and hosting</p>
          <h1 className="page-title">Blogs</h1>
        </div>
      </div>
      <BlogManager initialBlogs={JSON.parse(JSON.stringify(blogs))} />
    </AdminShell>
  );
}
