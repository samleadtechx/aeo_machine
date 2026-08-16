import Link from "next/link";
import { BarChart3, BookOpenCheck, Eye, Gauge, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AnalyticsPage() {
  const since = daysAgo(30);
  const sevenDaysAgo = daysAgo(7);

  const [events, leads, recentEvents] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      include: {
        blog: { select: { name: true, slug: true } },
        article: { select: { title: true, slug: true } },
      },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      include: {
        blog: { select: { name: true } },
        article: { select: { title: true, slug: true } },
      },
    }),
    prisma.analyticsEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        blog: { select: { name: true } },
        article: { select: { title: true, slug: true } },
      },
    }),
  ]);

  const opens7d = events.filter((event) => event.eventType === "ARTICLE_OPEN" && event.createdAt >= sevenDaysAgo).length;
  const deepReads7d = events.filter((event) => event.eventType === "DEEP_READ" && event.createdAt >= sevenDaysAgo).length;
  const leads7d = leads.filter((lead) => lead.createdAt >= sevenDaysAgo).length;
  const deepReadRate = opens7d ? Math.round((deepReads7d / opens7d) * 100) : 0;
  const daily = buildDailyRows(events, leads);
  const topArticles = buildArticleRows(events);
  const topSources = buildSourceRows(events, leads);
  const maxDaily = Math.max(1, ...daily.flatMap((day) => [day.opens, day.deepReads, day.leads]));

  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Traffic and conversion</p>
          <h1 className="page-title">Analytics</h1>
        </div>
        <div className="button-row">
          <Link className="btn" href="/settings">
            Tracking Settings
          </Link>
        </div>
      </div>

      <section className="grid-4">
        <div className="panel stat">
          <Eye size={18} />
          <strong>{opens7d}</strong>
          <span>Article opens, 7 days</span>
        </div>
        <div className="panel stat">
          <BookOpenCheck size={18} />
          <strong>{deepReads7d}</strong>
          <span>Deep reads, 7 days</span>
        </div>
        <div className="panel stat">
          <Gauge size={18} />
          <strong>{deepReadRate}%</strong>
          <span>Deep-read rate</span>
        </div>
        <div className="panel stat">
          <Users size={18} />
          <strong>{leads7d}</strong>
          <span>Leads, 7 days</span>
        </div>
      </section>

      <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
        <div className="button-row" style={{ justifyContent: "space-between" }}>
          <strong>Last 30 days</strong>
          <BarChart3 size={18} />
        </div>
        <div className="analytics-bars">
          {daily.map((day) => (
            <div className="analytics-day" key={day.key}>
              <span>{day.label}</span>
              <div className="analytics-meter" title={`${day.opens} opens`}>
                <i style={{ width: `${(day.opens / maxDaily) * 100}%` }} />
              </div>
              <div className="analytics-meter deep" title={`${day.deepReads} deep reads`}>
                <i style={{ width: `${(day.deepReads / maxDaily) * 100}%` }} />
              </div>
              <div className="analytics-meter lead" title={`${day.leads} leads`}>
                <i style={{ width: `${(day.leads / maxDaily) * 100}%` }} />
              </div>
              <b>{day.opens}</b>
              <b>{day.deepReads}</b>
              <b>{day.leads}</b>
            </div>
          ))}
        </div>
        <div className="analytics-legend">
          <span><i /> Opens</span>
          <span><i className="deep" /> Deep reads</span>
          <span><i className="lead" /> Leads</span>
        </div>
      </section>

      <section className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel panel-pad stack">
          <strong>Article performance</strong>
          <table className="table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Opens</th>
                <th>Deep reads</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {topArticles.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.title}</strong>
                    <div className="muted">{row.blogName}</div>
                  </td>
                  <td>{row.opens}</td>
                  <td>{row.deepReads}</td>
                  <td>{row.opens ? Math.round((row.deepReads / row.opens) * 100) : 0}%</td>
                </tr>
              ))}
              {topArticles.length === 0 ? (
                <tr><td className="muted" colSpan={4}>No tracked article events yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel panel-pad stack">
          <strong>Traffic sources</strong>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Events</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((row) => (
                <tr key={row.source}>
                  <td>{row.source}</td>
                  <td>{row.events}</td>
                  <td>{row.leads}</td>
                </tr>
              ))}
              {topSources.length === 0 ? (
                <tr><td className="muted" colSpan={3}>No source data yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
        <strong>Recent tracked events</strong>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Blog</th>
              <th>Article</th>
              <th>Source</th>
              <th>Event ID</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((event) => (
              <tr key={event.id}>
                <td>{formatDateTime(event.createdAt)}</td>
                <td><span className="badge">{event.eventType}</span></td>
                <td>{event.blog.name}</td>
                <td>{event.article?.title || event.articleSlug || "Unknown"}</td>
                <td>{sourceLabel(event)}</td>
                <td className="muted">{event.eventId}</td>
              </tr>
            ))}
            {recentEvents.length === 0 ? (
              <tr><td className="muted" colSpan={6}>No tracked events yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}

function buildDailyRows(events: Array<{ createdAt: Date; eventType: string }>, leads: Array<{ createdAt: Date }>) {
  const start = startOfDay(daysAgo(29));
  const rows = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    return {
      key: dateKey(date),
      label: formatDate(date).replace(/, \d{4}$/, ""),
      opens: 0,
      deepReads: 0,
      leads: 0,
    };
  });
  const map = new Map(rows.map((row) => [row.key, row]));
  for (const event of events) {
    const row = map.get(dateKey(event.createdAt));
    if (!row) continue;
    if (event.eventType === "ARTICLE_OPEN") row.opens += 1;
    if (event.eventType === "DEEP_READ") row.deepReads += 1;
  }
  for (const lead of leads) {
    const row = map.get(dateKey(lead.createdAt));
    if (row) row.leads += 1;
  }
  return rows;
}

function buildArticleRows(
  events: Array<{
    articleId: string | null;
    articleSlug: string | null;
    eventType: string;
    blog: { name: string };
    article: { title: string; slug: string } | null;
  }>
) {
  const rows = new Map<string, { key: string; title: string; blogName: string; opens: number; deepReads: number }>();
  for (const event of events) {
    if (event.eventType !== "ARTICLE_OPEN" && event.eventType !== "DEEP_READ") continue;
    const key = event.articleId || `${event.blog.name}:${event.articleSlug || "unknown"}`;
    const row = rows.get(key) || {
      key,
      title: event.article?.title || event.articleSlug || "Unknown article",
      blogName: event.blog.name,
      opens: 0,
      deepReads: 0,
    };
    if (event.eventType === "ARTICLE_OPEN") row.opens += 1;
    if (event.eventType === "DEEP_READ") row.deepReads += 1;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.opens - a.opens).slice(0, 10);
}

function buildSourceRows(
  events: Array<{ referrer: string | null; utmJson: unknown; queryJson: unknown }>,
  leads: Array<{ referrer: string | null; utmJson: unknown }>
) {
  const rows = new Map<string, { source: string; events: number; leads: number }>();
  for (const event of events) {
    const source = sourceLabel(event);
    const row = rows.get(source) || { source, events: 0, leads: 0 };
    row.events += 1;
    rows.set(source, row);
  }
  for (const lead of leads) {
    const source = sourceLabel(lead);
    const row = rows.get(source) || { source, events: 0, leads: 0 };
    row.leads += 1;
    rows.set(source, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.events + b.leads - (a.events + a.leads)).slice(0, 12);
}

function sourceLabel(value: { referrer?: string | null; utmJson?: unknown; queryJson?: unknown }) {
  const utm = objectValue(value.utmJson);
  const query = objectValue(value.queryJson);
  const utmSource = stringValue(utm.utm_source) || stringValue(query.utm_source);
  const refer = stringValue(query.refer);
  if (utmSource) return `utm: ${utmSource}`;
  if (refer) return `refer: ${refer}`;
  if (!value.referrer) return "Direct / unknown";
  try {
    const url = new URL(value.referrer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value.referrer;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY_MS);
}
