import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { createOpaqueToken, hashToken } from "../src/lib/auth/tokens";
import { encryptSecret } from "../src/lib/crypto/encryption";
import { ensurePublicWebhookEndpoint } from "../src/modules/blogs/service";
import { createFunnel } from "../src/modules/forms/service";
import { defaultFunnelConfig } from "../src/modules/forms/default-funnel";
import { createArticle, publishArticle } from "../src/modules/articles/service";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "change-me-on-first-run";

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await hashPassword(password),
      name: "Admin",
    },
    update: {},
  });

  const blog = await prisma.blog.upsert({
    where: { slug: "demo-growth-blog" },
    create: {
      name: "Demo Growth Blog",
      slug: "demo-growth-blog",
      baseUrl: "https://example.com/blog",
      domainMode: "SUBFOLDER",
      brandName: "Demo Growth Blog",
      primaryColor: "#2563eb",
      accentColor: "#0f766e",
      defaultAuthorName: "AEO Editorial Team",
      organizationName: "AEO Machine",
    },
    update: {},
  });

  await ensurePublicWebhookEndpoint(blog.id, "LEAD_INGEST");
  await ensurePublicWebhookEndpoint(blog.id, "TRACKING_EVENT");
  await ensurePublicWebhookEndpoint(blog.id, "BABYLOVEGROWTH");

  const funnel =
    (await prisma.funnel.findFirst({ where: { blogId: blog.id, slug: "lead-value-quiz" } })) ||
    (await createFunnel(blog.id, {
      name: "Lead Value Quiz",
      slug: "lead-value-quiz",
      status: "ACTIVE",
      configJson: defaultFunnelConfig,
      styleJson: { primaryColor: "#2563eb", accentColor: "#0f766e" },
    }));

  await prisma.funnelPlacementRule.upsert({
    where: { id: "seed-placement-rule-lead-value" },
    create: {
      id: "seed-placement-rule-lead-value",
      blogId: blog.id,
      funnelId: funnel.id,
      name: "SEO/AEO Article Quiz",
      enabled: true,
      matchMode: "ANY_TAG",
      tagSlugsJson: ["seo", "aeo"],
      placement: "AFTER_INTRO",
      priority: 10,
    },
    update: {
      blogId: blog.id,
      funnelId: funnel.id,
    },
  });

  const existingArticle = await prisma.article.findFirst({
    where: { blogId: blog.id, slug: "how-static-blog-funnels-improve-lead-quality" },
  });

  if (!existingArticle) {
    const article = await createArticle(blog.id, {
      title: "How Static Blog Funnels Improve Lead Quality",
      slug: "how-static-blog-funnels-improve-lead-quality",
      metaTitle: "How Static Blog Funnels Improve Lead Quality",
      metaDescription:
        "Learn how fast static blog pages, answer-focused article structure, and embedded quiz funnels can improve lead quality without slowing public pages.",
      excerpt:
        "Static articles can stay fast while embedded quiz funnels qualify visitors on the same domain.",
      authorName: "AEO Editorial Team",
      tags: ["SEO", "AEO"],
      markdown: demoArticleMarkdown(),
      noindex: false,
      source: "MANUAL",
    });
    await publishArticle(article!.id);
  }

  if (!(await prisma.mcpToken.findFirst({ where: { name: "Seed MCP Token" } }))) {
    const token = createOpaqueToken("aeo_mcp");
    await prisma.mcpToken.create({
      data: {
        name: "Seed MCP Token",
        tokenHash: hashToken(token),
        permissionsJson: [
          "blogs.read",
          "articles.read",
          "articles.create_draft",
          "articles.update_draft",
          "forms.read",
          "leads.read_summary",
        ],
      },
    });
    console.log(`Seed MCP token: ${token}`);
  }

  if (!(await prisma.integrationCredential.findFirst({ where: { blogId: blog.id, provider: "META" } }))) {
    await prisma.integrationCredential.create({
      data: {
        blogId: blog.id,
        provider: "META",
        name: "Meta placeholder",
        enabled: false,
        settingsJson: { pixelId: "" },
        secretsEncryptedJson: encryptSecret(JSON.stringify({ accessToken: "" })),
      },
    });
  }

  console.log(`Seeded admin: ${email}`);
  console.log("Password comes from ADMIN_PASSWORD in .env.");
}

function demoArticleMarkdown() {
  return `## Direct Answer

Static blog funnels improve lead quality by combining fast pre-rendered articles with a short, same-domain qualification flow. The article answers the visitor's question first, then the funnel asks focused questions that reveal intent, budget, fit, and urgency before a lead is stored in the central app.

## Why Speed Matters

Public blog pages should not wait on a central application server. AEO Machine renders each article ahead of time, uploads static HTML to the remote host, and keeps the browser experience fast. That setup helps visitors read the answer quickly and gives search crawlers predictable HTML, metadata, canonical tags, internal links, and structured data.

The lead capture flow can still be dynamic from the visitor's perspective. The generated quiz runs in the browser and submits to a PHP handler on the same public domain. That handler signs the payload and forwards it server-to-server to the main app. The browser never needs to post directly to the admin domain.

## What The Funnel Adds

A normal email form treats every reader the same. A two-option calculator asks a few simple questions and produces a result before requesting contact details. That sequence gives the visitor context, gives the business clearer qualification signals, and creates tracking events with a reusable event ID for browser/server deduplication.

Useful funnel signals include whether the reader is a decision-maker, whether the problem happens regularly, the value of a successful outcome, and whether the visitor wants help now. Those answers are stored with the lead, so follow-up can be more relevant than a generic form submission.

## SEO And AEO Guardrails

The article still needs visible, helpful content. AEO Machine should not hide text, generate deceptive doorway pages, or add schema for content that does not appear on the page. The publishing gate checks title, slug, meta title, meta description, canonical URL, body content, author, tags, and other blockers before an article can be published.

For answer engines, the page should contain a concise answer section, clear headings, definitions where useful, comparison tables when they genuinely help, and FAQs only when real questions and answers are visible. Internal links can point readers to related articles, while citations should be used when the page makes factual or statistical claims.

## Practical Workflow

An admin creates a blog, writes or imports an article, reviews the Markdown preview, fixes the SEO gate, publishes the article, and runs a static build. The build writes article pages, tag pages, sitemap, robots, RSS, Apache rewrite rules, funnel pages, and PHP endpoints into local storage. Deployment can then upload the changed files by SFTP or FTP.

[Explore the homepage](/) for other generated articles once more content is published.

## FAQ

### Does the public blog need a database?

No. The public blog is static HTML plus small PHP endpoints for same-domain lead and tracking handoff.

### Can imported articles publish automatically?

No. BabyLoveGrowth and MCP-created content becomes draft content for admin review.

### Does this guarantee rankings or AI answer inclusion?

No. The system improves technical SEO and answer-friendly structure, but it does not promise guaranteed rankings or inclusion.`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
