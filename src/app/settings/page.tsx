import { AdminShell } from "@/components/admin/AdminShell";
import { AnalyticsSettingsManager } from "@/components/admin/AnalyticsSettingsManager";
import { BabyLoveGrowthSettingsManager } from "@/components/admin/BabyLoveGrowthSettingsManager";
import { CopyValue } from "@/components/admin/CopyValue";
import { ImageOptimizationManager } from "@/components/admin/ImageOptimizationManager";
import { MediaManager } from "@/components/admin/MediaManager";
import { OutboundWebhookManager } from "@/components/admin/OutboundWebhookManager";
import { appUrl, publicWebhookBaseUrl, storageDir } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/encryption";
import { listAnalyticsSettings } from "@/modules/analytics/service";
import { listBabyLoveGrowthSettings } from "@/modules/baby-love-growth/service";
import { ensurePublicWebhookEndpoint, listBlogs } from "@/modules/blogs/service";
import { listOutboundWebhooks } from "@/modules/leads/outbound";
import { listMediaAssets } from "@/modules/media/service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const blogs = await listBlogs();
  await Promise.all(
    blogs.flatMap((blog) =>
      (["LEAD_INGEST", "TRACKING_EVENT", "BABYLOVEGROWTH"] as const).map((type) =>
        ensurePublicWebhookEndpoint(blog.id, type)
      )
    )
  );

  const [user, endpoints, media, outboundWebhooks, babyLoveGrowthSettings, analyticsSettings] = await Promise.all([
    prisma.user.findFirst(),
    prisma.publicWebhookEndpoint.findMany({
      include: { blog: { select: { name: true, slug: true } } },
      orderBy: [{ blogId: "asc" }, { type: "asc" }],
    }),
    listMediaAssets(),
    listOutboundWebhooks(),
    listBabyLoveGrowthSettings(),
    listAnalyticsSettings(),
  ]);
  const baseUrl = appUrl().replace(/\/+$/, "");
  const webhookBaseUrl = publicWebhookBaseUrl();
  const publicWebhookLooksExternal = /^https:\/\//i.test(webhookBaseUrl) && !/localhost|127\.0\.0\.1/i.test(webhookBaseUrl);
  const babyLoveGrowthSettingsByBlog = new Map(
    babyLoveGrowthSettings.map((setting) => [setting.blogId, setting])
  );
  const endpointCards = [...endpoints]
    .sort((a, b) => endpointPriority(a.type) - endpointPriority(b.type))
    .map((endpoint) => {
    const url = endpointUrl(webhookBaseUrl, endpoint.type, endpoint.publicId);
    const secret = decryptSecret(endpoint.secretEncrypted) || "";
    const samplePayload = samplePayloadFor(endpoint.type);
    const isBabyLoveGrowth = endpoint.type === "BABYLOVEGROWTH";
    const babyLoveGrowthAutoPublish = isBabyLoveGrowth
      ? babyLoveGrowthSettingsByBlog.get(endpoint.blogId)?.autoPublish ?? false
      : undefined;
    const babyLoveGrowthDefaultTags = isBabyLoveGrowth
      ? babyLoveGrowthSettingsByBlog.get(endpoint.blogId)?.defaultTags ?? []
      : undefined;
    const copyAll = {
      blog: endpoint.blog.name,
      type: endpoint.type,
      method: "POST",
      url,
      publicId: endpoint.publicId,
      ...(isBabyLoveGrowth ? { autoPublish: babyLoveGrowthAutoPublish } : {}),
      ...(isBabyLoveGrowth ? { defaultTags: babyLoveGrowthDefaultTags } : {}),
      [isBabyLoveGrowth ? "bearerToken" : "secret"]: secret,
      headers: isBabyLoveGrowth
        ? {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          }
        : {
            "Content-Type": "application/json",
            "X-AEO-Timestamp": "unix timestamp in seconds",
            "X-AEO-Signature": "hex hmac_sha256(secret, timestamp + '.' + rawBody)",
          },
      samplePayload: JSON.parse(samplePayload),
    };
      return { endpoint, url, secret, samplePayload, copyAll: JSON.stringify(copyAll, null, 2), isBabyLoveGrowth };
    });

  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">Environment</p>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>
      <section className="grid-2">
        <div className="panel panel-pad stack">
          <strong>Single admin</strong>
          <table className="table">
            <tbody>
              <tr><th>Email</th><td>{user?.email || "Not seeded"}</td></tr>
              <tr><th>Name</th><td>{user?.name || "Admin"}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="panel panel-pad stack">
          <strong>Runtime</strong>
          <table className="table">
            <tbody>
              <tr><th>App URL</th><td>{baseUrl}</td></tr>
              <tr><th>Public webhook URL</th><td>{webhookBaseUrl}</td></tr>
              <tr><th>Storage</th><td>{storageDir()}</td></tr>
              <tr><th>Worker poll</th><td>{process.env.WORKER_POLL_INTERVAL_MS || "2000"} ms</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {!publicWebhookLooksExternal ? (
        <div className="notice error-notice" style={{ marginTop: 16 }}>
          <strong>Public webhook URL is not externally reachable.</strong>
          {" "}
          BabyLoveGrowth and deployed PHP lead forms need `PUBLIC_WEBHOOK_BASE_URL` to be a public HTTPS
          admin URL. Current value: {webhookBaseUrl}
        </div>
      ) : null}

      <MediaManager
        initialBlogs={JSON.parse(JSON.stringify(blogs))}
        initialMedia={JSON.parse(JSON.stringify(media))}
      />

      <ImageOptimizationManager
        initialBlogs={JSON.parse(JSON.stringify(blogs))}
        initialMedia={JSON.parse(JSON.stringify(media))}
      />

      <OutboundWebhookManager
        initialBlogs={JSON.parse(JSON.stringify(blogs))}
        initialWebhooks={JSON.parse(JSON.stringify(outboundWebhooks))}
      />

      <BabyLoveGrowthSettingsManager
        initialBlogs={blogs.map((blog) => ({
          id: blog.id,
          name: blog.name,
          slug: blog.slug,
          defaultAuthorName: blog.defaultAuthorName,
        }))}
        initialSettings={JSON.parse(JSON.stringify(babyLoveGrowthSettings))}
      />

      <AnalyticsSettingsManager
        initialBlogs={blogs.map((blog) => ({
          id: blog.id,
          name: blog.name,
          slug: blog.slug,
        }))}
        initialSettings={JSON.parse(JSON.stringify(analyticsSettings))}
      />

      <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
        <div>
          <p className="eyebrow">Copy-ready integration details</p>
          <h2 className="page-title" style={{ fontSize: 22 }}>Public Webhook Endpoints</h2>
        </div>
        <div className="notice">
          BabyLoveGrowth imports use the BabyLoveGrowth endpoint below. In BabyLoveGrowth, open
          Settings &rarr; Publishing &rarr; Webhook, paste the endpoint URL, and use the bearer token
          as the webhook secret/token. Imported articles are created as drafts unless auto-publish is enabled
          for that blog above.
          {" "}
          <a href="https://www.babylovegrowth.ai/docs/integrations/webhook" target="_blank" rel="noreferrer">
            BabyLoveGrowth webhook docs
          </a>
        </div>
        <div className="grid-2">
          {endpointCards.map(({ endpoint, url, secret, samplePayload, copyAll, isBabyLoveGrowth }) => (
            <div className="panel panel-pad stack" key={endpoint.id} style={{ boxShadow: "none" }}>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{endpoint.type}</strong>
                  <div className="muted">{endpoint.blog.name}</div>
                </div>
                <span className={`badge ${endpoint.enabled ? "pass" : "warn"}`}>
                  {endpoint.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <CopyValue label="Endpoint URL" value={url} />
              <CopyValue label="Public ID" value={endpoint.publicId} />
              <CopyValue label={isBabyLoveGrowth ? "Bearer token" : "Signing secret"} value={secret} />
              {isBabyLoveGrowth ? (
                <CopyValue
                  label="BabyLoveGrowth headers"
                  multiline
                  value={[
                    "Content-Type: application/json",
                    `Authorization: Bearer ${secret}`,
                  ].join("\n")}
                />
              ) : (
                <CopyValue
                  label="Required headers"
                  multiline
                  value={[
                    "Content-Type: application/json",
                    "X-AEO-Timestamp: <unix timestamp seconds>",
                    "X-AEO-Signature: hmac_sha256(secret, timestamp + '.' + rawBody)",
                  ].join("\n")}
                />
              )}
              <CopyValue label="Sample payload" multiline value={samplePayload} />
              <CopyValue label="Copy all config" multiline value={copyAll} />
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

function endpointUrl(baseUrl: string, type: string, publicId: string) {
  if (type === "BABYLOVEGROWTH") {
    return `${baseUrl}/api/public/integrations/babylovegrowth/${publicId}`;
  }
  if (type === "LEAD_INGEST") {
    return `${baseUrl}/api/public/blog-webhooks/${publicId}/leads`;
  }
  return `${baseUrl}/api/public/blog-webhooks/${publicId}/events`;
}

function samplePayloadFor(type: string) {
  if (type === "BABYLOVEGROWTH") {
    return JSON.stringify(
      {
        id: 10,
        title: "Test Article for Webhook Integration",
        slug: "test-article-for-webhook-integration",
        metaDescription:
          "Test article to verify webhook integration is working correctly",
        content_html: "<h1>Test Article for Webhook Integration</h1>",
        heroImageUrl: "https://cdn.example.com/hero-image.jpg",
        content_markdown: "# Test Article for Webhook Integration",
        jsonLd: { "@context": "https://schema.org", "@type": "Article" },
        faqJsonLd: { "@context": "https://schema.org", "@type": "FAQPage" },
        languageCode: "en",
        publicUrl: "https://example.com/test-article-webhook",
        createdAt: "2025-03-20T03:41:18.570Z",
      },
      null,
      2
    );
  }

  if (type === "LEAD_INGEST") {
    return JSON.stringify(
      {
        remoteSubmissionId: "remote-submission-123",
        funnelSlug: "lead-value-quiz",
        email: "lead@example.com",
        answers: { owner: "owner" },
        resultText: "Lead result text",
        sourceUrl: "https://example.com/blog/article/",
        eventId: "event-id-from-browser",
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      event_name: "PageView",
      event_id: "event-id-from-browser",
      source_url: "https://example.com/blog/article/",
      referrer: "https://referrer.example/",
    },
    null,
    2
  );
}

function endpointPriority(type: string) {
  if (type === "BABYLOVEGROWTH") return 0;
  if (type === "LEAD_INGEST") return 1;
  return 2;
}
