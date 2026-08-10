import { AdminShell } from "@/components/admin/AdminShell";
import { ArticleWorkspace } from "@/components/articles/ArticleWorkspace";
import { listArticles } from "@/modules/articles/service";
import { listBlogs } from "@/modules/blogs/service";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const [blogs, articles] = await Promise.all([listBlogs(), listArticles()]);
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Markdown and publishing gate</p>
          <h1 className="page-title">Articles</h1>
        </div>
      </div>
      <ArticleWorkspace
        initialBlogs={JSON.parse(JSON.stringify(blogs))}
        initialArticles={JSON.parse(JSON.stringify(articles))}
      />
    </AdminShell>
  );
}
