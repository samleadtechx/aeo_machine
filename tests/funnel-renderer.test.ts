import { describe, expect, it } from "vitest";
import { renderFunnelHtml, renderSubmitPhp } from "@/modules/forms/renderer";
import { defaultFunnelConfig } from "@/modules/forms/default-funnel";

const funnel = {
  id: "funnel_1",
  slug: "lead-value-quiz",
  name: "Lead Value Quiz",
  configJson: defaultFunnelConfig,
  styleJson: { primaryColor: "#2563eb", accentColor: "#0f766e" },
};

const endpoint = {
  publicId: "lead-public-id",
};

describe("funnel renderer", () => {
  it("renders quiz screens and same-domain submit URL", () => {
    const html = renderFunnelHtml({ funnel, endpoint, webhookSecret: "secret" });
    expect(html).toContain('data-screen="question"');
    expect(html).toContain('const submitUrl = "/forms/lead-value-quiz-submit.html"');
    expect(html).toContain("noindex,follow");
  });

  it("supports subfolder direct PHP endpoints when htaccess is unavailable", () => {
    const html = renderFunnelHtml({
      funnel,
      endpoint,
      webhookSecret: "secret",
      publicBasePath: "/blog",
      directPhpEndpoints: true,
    });
    expect(html).toContain('const submitUrl = "/blog/forms/lead-value-quiz-submit.php"');
    expect(html).toContain('const trackUrl = "/blog/track/collect.php"');
    expect(html).toContain('href="/blog/terms.html"');
  });

  it("renders PHP HMAC forwarding without exposing raw internals", () => {
    const php = renderSubmitPhp({ funnel, endpoint, webhookSecret: "secret" });
    expect(php).toContain("hash_hmac('sha256'");
    expect(php).toContain("X-AEO-Signature");
    expect(php).toContain("/api/public/blog-webhooks/lead-public-id/leads");
  });

  it("rewrites funnel option media to build-local assets", () => {
    const config = structuredClone(defaultFunnelConfig);
    config.questions[0].options[0].imageUrl = "https://admin.example.com/assets/media/yes.jpg";
    config.questions[0].options[1].imageMediaId = "media_no";

    const html = renderFunnelHtml({
      funnel: { ...funnel, configJson: config },
      endpoint,
      webhookSecret: "secret",
      mediaMap: {
        "https://admin.example.com/assets/media/yes.jpg": "/assets/media/yes-local.jpg",
        media_no: "/assets/media/no-local.jpg",
      },
    });

    expect(html).toContain("/assets/media/yes-local.jpg");
    expect(html).toContain("/assets/media/no-local.jpg");
    expect(html).not.toContain("https://admin.example.com/assets/media/yes.jpg");
  });
});
