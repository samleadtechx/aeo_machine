import Link from "next/link";
import { BookOpenCheck, Eye, FilePlus2, FormInput, Gauge, Globe2, Rocket } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sevenDaysAgo = daysAgo(7);
  const [
    totalBlogs,
    publishedArticles,
    reviewDrafts,
    failedSeo,
    articleOpens7d,
    deepReads7d,
    leads7d,
    recentLeads,
    recentDeployments,
  ] = await Promise.all([
    prisma.blog.count(),
    prisma.article.count({ where: { status: "PUBLISHED" } }),
    prisma.article.count({ where: { status: { in: ["DRAFT", "REVIEW"] } } }),
    prisma.article.count({ where: { seoGateStatus: "FAIL" } }),
    prisma.analyticsEvent.count({ where: { eventType: "ARTICLE_OPEN", createdAt: { gte: sevenDaysAgo } } }),
    prisma.analyticsEvent.count({ where: { eventType: "DEEP_READ", createdAt: { gte: sevenDaysAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { blog: true, funnel: true },
    }),
    prisma.deployment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { blog: true, build: true },
    }),
  ]);

  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="button-row">
          <Link className="btn primary" href="/articles">
            <FilePlus2 size={16} />
            New Article
          </Link>
          <Link className="btn" href="/blogs">
            <Globe2 size={16} />
            New Blog
          </Link>
          <Link className="btn" href="/funnels">
            <FormInput size={16} />
            New Funnel
          </Link>
        </div>
      </div>

      <section className="grid-4">
        <div className="panel stat">
          <strong>{totalBlogs}</strong>
          <span>Total blogs</span>
        </div>
        <div className="panel stat">
          <strong>{publishedArticles}</strong>
          <span>Published articles</span>
        </div>
        <div className="panel stat">
          <strong>{reviewDrafts}</strong>
          <span>Drafts and review</span>
        </div>
        <div className="panel stat">
          <strong>{failedSeo}</strong>
          <span>SEO blockers</span>
        </div>
      </section>

      <section className="grid-4" style={{ marginTop: 16 }}>
        <Link className="panel stat stat-link" href="/analytics">
          <Eye size={18} />
          <strong>{articleOpens7d}</strong>
          <span>Article opens, 7 days</span>
        </Link>
        <Link className="panel stat stat-link" href="/analytics">
          <BookOpenCheck size={18} />
          <strong>{deepReads7d}</strong>
          <span>Deep reads, 7 days</span>
        </Link>
        <Link className="panel stat stat-link" href="/analytics">
          <Gauge size={18} />
          <strong>{articleOpens7d ? Math.round((deepReads7d / articleOpens7d) * 100) : 0}%</strong>
          <span>Deep-read rate</span>
        </Link>
        <Link className="panel stat stat-link" href="/leads">
          <FormInput size={18} />
          <strong>{leads7d}</strong>
          <span>Leads, 7 days</span>
        </Link>
      </section>

      <section className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel panel-pad stack">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <strong>Recent leads</strong>
            <Link className="btn" href="/leads">
              View
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Blog</th>
                <th>Funnel</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.email || lead.phone || lead.name || "Anonymous"}</td>
                  <td>{lead.blog.name}</td>
                  <td>{lead.funnel?.name || "Unknown"}</td>
                  <td>{formatDateTime(lead.createdAt)}</td>
                </tr>
              ))}
              {recentLeads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No leads yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel panel-pad stack">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <strong>Recent deployments</strong>
            <Link className="btn" href="/deployments">
              <Rocket size={16} />
              Deployments
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Blog</th>
                <th>Status</th>
                <th>Files</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentDeployments.map((deployment) => (
                <tr key={deployment.id}>
                  <td>{deployment.blog.name}</td>
                  <td>
                    <span className={`badge ${deployment.status === "SUCCESS" ? "pass" : deployment.status === "FAILED" ? "fail" : "warn"}`}>
                      {deployment.status}
                    </span>
                  </td>
                  <td>{deployment.uploadedFiles}</td>
                  <td>{formatDateTime(deployment.createdAt)}</td>
                </tr>
              ))}
              {recentDeployments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No deployments yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
