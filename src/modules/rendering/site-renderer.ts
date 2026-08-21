import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import type { Article, Blog, Funnel, FunnelPlacementRule, PublicWebhookEndpoint, Tag } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storageDir } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto/encryption";
import { createManifest, manifestTotals } from "@/lib/utils/files";
import { canonicalArticleUrl, joinUrl } from "@/lib/utils/url";
import { escapeAttribute, escapeHtml, jsonScript, stripHtml } from "@/lib/utils/html";
import { formatDate } from "@/lib/utils/dates";
import { auditArticleSeo } from "@/modules/seo/audit";
import { markdownToHtml } from "@/modules/articles/markdown";
import { getAnalyticsRenderSettings, type AnalyticsRenderSettings } from "@/modules/analytics/service";
import { ensurePublicWebhookEndpoint } from "@/modules/blogs/service";
import { renderFunnelHtml, renderSubmitPhp, renderTrackPhp } from "@/modules/forms/renderer";
import {
  collectReferencedMediaIds,
  collectRemoteImageSources,
  copyMediaAssetsToBuild,
  copyRemoteImagesToBuild,
  replaceMarkdownMediaReferences,
  type BuildImageSourceMap,
  type BuildMediaMap,
} from "@/modules/media/service";

type ArticleWithTags = Article & {
  tags: { tag: Tag }[];
};

type FunnelWithRules = Funnel & {
  placementRules: FunnelPlacementRule[];
};

type RenderOptions = {
  cleanUrls: boolean;
  htaccessEnabled: boolean;
};

type BuildReason = "MANUAL" | "ARTICLE_PUBLISH" | "FUNNEL_UPDATE" | "SETTINGS_UPDATE";

export async function buildBlogStaticSite(blogId: string, reason: BuildReason = "MANUAL") {
  const build = await prisma.build.create({
    data: {
      blogId,
      reason,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const blog = await prisma.blog.findUniqueOrThrow({
      where: { id: blogId },
      include: {
        articles: {
          where: { status: "PUBLISHED" },
          include: { tags: { include: { tag: true } } },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
        },
        funnels: {
          where: { status: "ACTIVE" },
          include: { placementRules: { where: { enabled: true }, orderBy: { priority: "asc" } } },
        },
        deploymentTargets: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const latestTarget = blog.deploymentTargets[0];
    const renderOptions: RenderOptions = {
      cleanUrls: latestTarget?.cleanUrlMode !== "HTML",
      htaccessEnabled: latestTarget?.htaccessEnabled ?? true,
    };

    for (const article of blog.articles) {
      const audit = auditArticleSeo(article, blog, article.tags.map((entry) => entry.tag));
      if (audit.status === "FAIL") {
        throw new Error(`Published article "${article.title}" failed SEO gate during build.`);
      }
    }

    const leadEndpoint = await ensurePublicWebhookEndpoint(blog.id, "LEAD_INGEST");
    const trackingEndpoint = await ensurePublicWebhookEndpoint(blog.id, "TRACKING_EVENT");
    const leadSecret = decryptSecret(leadEndpoint.secretEncrypted);
    const trackingSecret = decryptSecret(trackingEndpoint.secretEncrypted);
    if (!leadSecret || !trackingSecret) throw new Error("Blog webhook secrets are missing.");
    const analyticsSettings = await getAnalyticsRenderSettings(blog.id);

    const outputPath = path.resolve(storageDir(), "builds", blog.id, build.id);
    await rm(outputPath, { recursive: true, force: true });
    await mkdir(outputPath, { recursive: true });
    await mkdir(path.join(outputPath, "forms"), { recursive: true });
    await mkdir(path.join(outputPath, "track"), { recursive: true });
    await mkdir(path.join(outputPath, "tags"), { recursive: true });

    const articles = blog.articles as ArticleWithTags[];
    const funnels = blog.funnels as FunnelWithRules[];
    const referencedMediaIds = Array.from(
      new Set([
        ...(await collectReferencedMediaIds(blog.id, { articles, funnels })),
        blog.logoMediaId,
        blog.faviconMediaId,
        blog.organizationLogoMediaId,
      ].filter(Boolean) as string[])
    );
    const mediaMap = publicAssetMap(blog, await copyMediaAssetsToBuild(blog, referencedMediaIds, outputPath));
    const remoteImageSources = collectRemoteImageSources({ articles, funnels }).filter((source) => !mediaMap[source]);
    const imageSourceMap = publicAssetMap(blog, await copyRemoteImagesToBuild(remoteImageSources, outputPath, blog));
    const cardMediaMap = { ...imageSourceMap, ...mediaMap };
    await writeFile(path.join(outputPath, "index.html"), renderIndexPage(blog, articles, renderOptions, cardMediaMap), "utf8");
    await writeFile(path.join(outputPath, "robots.txt"), renderRobots(blog), "utf8");
    await writeFile(path.join(outputPath, "rss.xml"), renderRss(blog, articles, renderOptions), "utf8");
    await writeFile(path.join(outputPath, "sitemap.xml"), renderSitemap(blog, articles, funnels, renderOptions), "utf8");
    if (renderOptions.htaccessEnabled) {
      await writeFile(path.join(outputPath, ".htaccess"), renderHtaccess(blog), "utf8");
    }
    await writeFile(path.join(outputPath, "privacy.html"), renderLegalPage(blog, "Privacy Policy", mediaMap), "utf8");
    await writeFile(path.join(outputPath, "terms.html"), renderLegalPage(blog, "Terms of Service", mediaMap), "utf8");
    await writeFile(path.join(outputPath, "track", "collect.php"), renderTrackPhp(trackingEndpoint, trackingSecret), "utf8");

    for (const article of articles) {
      const html = await renderArticlePage(
        blog,
        article,
        articles,
        funnels,
        leadEndpoint,
        leadSecret,
        mediaMap,
        imageSourceMap,
        renderOptions,
        analyticsSettings
      );
      await writeFile(path.join(outputPath, `${article.slug}.html`), html, "utf8");
    }

    const tags = uniqueTags(articles);
    for (const tag of tags) {
      await writeFile(
        path.join(outputPath, "tags", `${tag.slug}.html`),
        renderTagPage(
          blog,
          tag,
          articles.filter((article) => article.tags.some((entry) => entry.tag.slug === tag.slug)),
          renderOptions,
          cardMediaMap
        ),
        "utf8"
      );
    }

    for (const funnel of funnels) {
      await writeFile(
        path.join(outputPath, "forms", `${funnel.slug}.html`),
        renderFunnelHtml({
          funnel,
          endpoint: leadEndpoint,
          webhookSecret: leadSecret,
          mediaMap: { ...imageSourceMap, ...mediaMap },
          publicBasePath: publicPath(blog),
          directPhpEndpoints: !renderOptions.htaccessEnabled,
        }),
        "utf8"
      );
      await writeFile(
        path.join(outputPath, "forms", `${funnel.slug}-submit.php`),
        renderSubmitPhp({ funnel, endpoint: leadEndpoint, webhookSecret: leadSecret }),
        "utf8"
      );
    }

    const manifest = await createManifest(outputPath);
    const totals = manifestTotals(manifest);
    await prisma.build.update({
      where: { id: build.id },
      data: {
        status: "SUCCESS",
        outputPath,
        manifestJson: manifest,
        fileCount: totals.fileCount,
        sizeBytes: totals.sizeBytes,
        completedAt: new Date(),
      },
    });

    return prisma.build.findUniqueOrThrow({ where: { id: build.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Build failed";
    await prisma.build.update({
      where: { id: build.id },
      data: {
        status: "FAILED",
        error: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function renderArticlePage(
  blog: Blog,
  article: ArticleWithTags,
  allArticles: ArticleWithTags[],
  funnels: FunnelWithRules[],
  leadEndpoint: PublicWebhookEndpoint,
  leadSecret: string,
  mediaMap: BuildMediaMap,
  imageSourceMap: BuildImageSourceMap,
  options: RenderOptions,
  analyticsSettings: AnalyticsRenderSettings
) {
  const canonical = articleCanonicalUrl(blog, article, options);
  const rewrittenMarkdown = await replaceMarkdownMediaReferences(blog.id, article.markdown, mediaMap, imageSourceMap);
  const bodyHtml = await markdownToHtml(stripLeadingMarkdownTitle(rewrittenMarkdown, article.title));
  const related = allArticles
    .filter((candidate) => candidate.id !== article.id)
    .filter((candidate) =>
      candidate.tags.some((tag) => article.tags.some((ownTag) => ownTag.tag.slug === tag.tag.slug))
    )
    .slice(0, 3);
  const funnelEmbed = matchingFunnelEmbed(blog, article, funnels, leadEndpoint, leadSecret, mediaMap, imageSourceMap, options);
  const articleBody = funnelEmbed ? injectFunnel(bodyHtml, funnelEmbed.html, funnelEmbed.placement) : bodyHtml;
  const publishedAt = article.publishedAt || article.createdAt;
  const heroUrl = article.heroMediaId ? mediaMap[article.heroMediaId] : null;
  const renderHeroImage = Boolean(heroUrl && !firstBodyImageMatchesHero(article, mediaMap));
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.metaDescription || article.excerpt,
    datePublished: publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { "@type": "Person", name: article.authorName || blog.defaultAuthorName },
    publisher: {
      "@type": "Organization",
      name: blog.organizationName || blog.brandName,
    },
    mainEntityOfPage: canonical,
    image: heroUrl ? absolutePublicUrl(blog, heroUrl) : undefined,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: blog.brandName, item: blog.baseUrl },
      { "@type": "ListItem", position: 2, name: article.title, item: canonical },
    ],
  };

  return pageShell({
    blog,
    mediaMap,
    ogType: "article",
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt || "",
    canonical,
    bodyScript: renderArticleTrackingScript(blog, article, options, analyticsSettings),
    content: `
      <article class="article">
        <header class="article-head">
          <div class="eyebrow">${escapeHtml(article.tags.map((entry) => entry.tag.name).join(" / "))}</div>
          <h1>${escapeHtml(article.title)}</h1>
          <p>${escapeHtml(article.excerpt || article.metaDescription || "")}</p>
          <div class="byline">By ${escapeHtml(article.authorName || blog.defaultAuthorName)} | ${escapeHtml(formatDate(publishedAt))}</div>
        </header>
        ${
          renderHeroImage && heroUrl
            ? `<img class="hero-image" src="${escapeAttribute(heroUrl)}" alt="${escapeAttribute(article.heroAlt || article.title)}" loading="eager" />`
            : ""
        }
        <div class="content-body">${articleBody}</div>
      </article>
      ${
        related.length
          ? `<section class="related"><h2>Related Articles</h2><div class="cards">${related
              .map((item) => articleCard(blog, item, options, { ...imageSourceMap, ...mediaMap }))
              .join("")}</div></section>`
          : ""
        }
      <script type="application/ld+json">${jsonScript(schema)}</script>
      <script type="application/ld+json">${jsonScript(breadcrumb)}</script>
    `,
  });
}

function firstBodyImageMatchesHero(article: Pick<Article, "heroMediaId" | "markdown">, mediaMap: BuildMediaMap) {
  if (!article.heroMediaId) return false;
  const source = firstMarkdownImageSource(article.markdown);
  if (!source) return false;

  const heroUrl = mediaMap[article.heroMediaId];
  return (
    source === article.heroMediaId ||
    source === `media:${article.heroMediaId}` ||
    Boolean(heroUrl && source === heroUrl) ||
    Boolean(heroUrl && mediaMap[source] === heroUrl)
  );
}

function firstMarkdownImageSource(markdown: string) {
  const match = markdown
    .trimStart()
    .match(/^!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/);
  return match?.[1] || null;
}

function firstMarkdownImageSourceAnywhere(markdown: string) {
  const markdownMatch = markdown.match(/!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/);
  if (markdownMatch?.[1]) return markdownMatch[1];
  const htmlMatch = markdown.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return htmlMatch?.[1] || null;
}

function stripLeadingMarkdownTitle(markdown: string, title: string) {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex < 0) return markdown;

  const heading = lines[firstContentIndex].match(/^#\s+(.+?)\s*#*\s*$/);
  if (!heading || normalizeHeadingText(heading[1]) !== normalizeHeadingText(title)) return markdown;

  lines.splice(firstContentIndex, 1);
  while (lines[firstContentIndex]?.trim() === "") {
    lines.splice(firstContentIndex, 1);
  }
  return lines.join("\n").trimStart();
}

function normalizeHeadingText(value: string) {
  return value
    .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[#>*_`~\\]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function renderIndexPage(blog: Blog, articles: ArticleWithTags[], options: RenderOptions, mediaMap: BuildMediaMap) {
  const cards = articles.map((article) => articleCard(blog, article, options, mediaMap)).join("");
  const schema = renderIndexStructuredData(blog, articles, options, mediaMap);
  return pageShell({
    blog,
    mediaMap,
    title: `${blog.brandName} Blog`,
    description: `${blog.brandName} articles, guides, and resources.`,
    canonical: blog.baseUrl,
    content: `
      <section class="index-head">
        <div>
          <p class="eyebrow">Latest from ${escapeHtml(blog.brandName)}</p>
          <h1>${escapeHtml(blog.brandName)} Articles</h1>
          <p>Articles, guides, and resources from ${escapeHtml(blog.brandName)}.</p>
          <label class="article-search" for="article-search-input">
            <span>Search articles</span>
            <input id="article-search-input" type="search" placeholder="Search by article title..." autocomplete="off" />
          </label>
        </div>
      </section>
      <section class="cards" data-article-list>${cards || "<p>No published articles yet.</p>"}</section>
      <p class="article-search-empty" data-search-empty hidden>No articles match your search.</p>
      ${articles.length ? articleSearchScript() : ""}
      ${jsonLdScripts(schema)}
    `,
  });
}

function renderIndexStructuredData(
  blog: Blog,
  articles: ArticleWithTags[],
  options: RenderOptions,
  mediaMap: BuildMediaMap
) {
  const organization = {
    "@type": "Organization",
    name: blog.organizationName || blog.brandName,
  };
  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${blog.brandName} Blog`,
    description: `${blog.brandName} articles, guides, and resources.`,
    url: blog.baseUrl,
    publisher: organization,
  };
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${blog.brandName} Articles`,
    description: `${blog.brandName} articles, guides, and resources.`,
    url: blog.baseUrl,
    isPartOf: {
      "@type": "Blog",
      name: `${blog.brandName} Blog`,
      url: blog.baseUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.map((article, index) => {
        const imageUrl = articleCardImageUrl(article, mediaMap);
        return {
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "BlogPosting",
            headline: article.title,
            description: article.metaDescription || article.excerpt || undefined,
            url: articleCanonicalUrl(blog, article, options),
            datePublished: (article.publishedAt || article.createdAt).toISOString(),
            dateModified: article.updatedAt.toISOString(),
            author: { "@type": "Person", name: article.authorName || blog.defaultAuthorName },
            image: imageUrl ? absolutePublicUrl(blog, imageUrl) : undefined,
          },
        };
      }),
    },
  };
  return [blogSchema, collectionSchema];
}

function jsonLdScripts(items: unknown[]) {
  return items.map((item) => `<script type="application/ld+json">${jsonScript(item)}</script>`).join("");
}

function renderTagPage(blog: Blog, tag: Tag, articles: ArticleWithTags[], options: RenderOptions, mediaMap: BuildMediaMap) {
  return pageShell({
    blog,
    mediaMap,
    title: `${tag.name} Articles | ${blog.brandName}`,
    description: `Articles tagged ${tag.name} from ${blog.brandName}.`,
    canonical: joinUrl(blog.baseUrl, options.cleanUrls ? `tags/${tag.slug}/` : `tags/${tag.slug}.html`),
    content: `
      <section class="index-head">
        <div>
          <p class="eyebrow">Tag</p>
          <h1>${escapeHtml(tag.name)}</h1>
        </div>
      </section>
      <section class="cards">${articles.map((article) => articleCard(blog, article, options, mediaMap)).join("")}</section>
    `,
  });
}

function renderLegalPage(blog: Blog, title: string, mediaMap: BuildMediaMap) {
  return pageShell({
    blog,
    mediaMap,
    title: `${title} | ${blog.brandName}`,
    description: `${title} for ${blog.brandName}.`,
    canonical: joinUrl(blog.baseUrl, title.toLowerCase().startsWith("privacy") ? "privacy.html" : "terms.html"),
    content: `
      <article class="article">
        <header class="article-head">
          <p class="eyebrow">${escapeHtml(blog.brandName)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>Replace this placeholder with blog-specific legal content before production launch.</p>
        </header>
        <div class="content-body">
          <p>${escapeHtml(blog.brandName)} should publish accurate, domain-specific ${escapeHtml(title.toLowerCase())} content before collecting leads.</p>
        </div>
      </article>
    `,
  });
}

function pageShell(props: {
  blog: Blog;
  mediaMap?: BuildMediaMap;
  title: string;
  description: string;
  canonical: string;
  content: string;
  ogType?: "article" | "website";
  bodyScript?: string;
}) {
  const { blog, mediaMap = {}, title, description, canonical, content, ogType = "website", bodyScript = "" } = props;
  const logoUrl = blog.logoMediaId ? mediaMap[blog.logoMediaId] : null;
  const faviconUrl = (blog.faviconMediaId ? mediaMap[blog.faviconMediaId] : null) || logoUrl;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}" />
  <meta name="robots" content="${escapeAttribute(blog.robotsPolicy)}" />
  <link rel="canonical" href="${escapeAttribute(canonical)}" />
  <meta property="og:title" content="${escapeAttribute(title)}" />
  <meta property="og:description" content="${escapeAttribute(description)}" />
  <meta property="og:url" content="${escapeAttribute(canonical)}" />
  <meta property="og:type" content="${escapeAttribute(ogType)}" />
  <meta name="twitter:card" content="summary_large_image" />
  ${faviconUrl ? `<link rel="icon" href="${escapeAttribute(faviconUrl)}" />` : ""}
  ${themeCss(blog)}
</head>
<body>
  <header class="site-header">
    <a class="brand ${logoUrl ? "has-logo" : ""}" href="${escapeAttribute(publicPath(blog))}">
      ${logoUrl ? `<img class="brand-logo" src="${escapeAttribute(logoUrl)}" alt="${escapeAttribute(blog.brandName)}" />` : escapeHtml(blog.brandName)}
    </a>
    <nav><a href="${escapeAttribute(publicPath(blog))}">Articles</a><a href="${escapeAttribute(publicPath(blog, "privacy.html"))}">Privacy</a><a href="${escapeAttribute(publicPath(blog, "terms.html"))}">Terms</a></nav>
  </header>
  <main>${content}</main>
  <footer class="site-footer">
    <span>${escapeHtml(blog.organizationName || blog.brandName)}</span>
    <span>All rights reserved.</span>
  </footer>
  ${bodyScript}
</body>
</html>`;
}

function renderArticleTrackingScript(
  blog: Blog,
  article: Pick<Article, "slug" | "title">,
  options: RenderOptions,
  settings: AnalyticsRenderSettings
) {
  if (!settings.trackingEnabled) return "";
  const trackUrl = publicPath(blog, `track/collect.${options.htaccessEnabled ? "html" : "php"}`);
  const config = {
    trackUrl,
    pixelId: settings.pixelId,
    eventMap: settings.eventMap,
    deepReadScrollPercent: settings.deepReadScrollPercent,
    deepReadSeconds: settings.deepReadSeconds,
    articleSlug: article.slug,
    articleTitle: article.title,
  };

  return `<script>
(() => {
  const config = ${jsonScript(config)};
  const standardEvents = new Set(['PageView','ViewContent','Lead','CompleteRegistration','Contact','CustomizeProduct','Donate','FindLocation','Schedule','Search','StartTrial','SubmitApplication','Subscribe']);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2));
  const getCookie = (name) => document.cookie.split('; ').find((item) => item.startsWith(name + '='))?.split('=')[1] || '';
  const setCookie = (name, value) => {
    document.cookie = name + '=' + encodeURIComponent(value) + '; Max-Age=31536000; Path=/; SameSite=Lax';
  };
  const storedVisitor = localStorage.getItem('aeo_visitor_id') || decodeURIComponent(getCookie('aeo_vid') || '');
  const visitorId = storedVisitor || 'v_' + uuid();
  localStorage.setItem('aeo_visitor_id', visitorId);
  setCookie('aeo_vid', visitorId);
  const sessionId = sessionStorage.getItem('aeo_session_id') || 's_' + uuid();
  sessionStorage.setItem('aeo_session_id', sessionId);
  const landingUrl = sessionStorage.getItem('aeo_landing_url') || window.location.href;
  sessionStorage.setItem('aeo_landing_url', landingUrl);
  const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  const utm = Object.fromEntries(Object.entries(query).filter(([key]) => /^utm_|^(gclid|fbclid|msclkid|refer)$/i.test(key)));
  const device = () => ({
    browser: navigator.userAgent,
    language: navigator.language || '',
    platform: navigator.platform || '',
    viewport: window.innerWidth + 'x' + window.innerHeight,
    screen: (screen.width || 0) + 'x' + (screen.height || 0),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  });

  if (config.pixelId) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', config.pixelId);
  }

  const pixelTrack = (eventType, eventName, eventId, customData) => {
    if (!config.pixelId || typeof fbq !== 'function' || !eventName) return;
    const method = eventType === 'DEEP_READ' || !standardEvents.has(eventName) ? 'trackCustom' : 'track';
    fbq(method, eventName, customData || {}, { eventID: eventId });
  };

  const postEvent = (eventType, eventName, eventId, extra = {}) => {
    const payload = Object.assign({
      event_type: eventType,
      event_name: eventName,
      event_id: eventId,
      source_url: window.location.href,
      landing_url: landingUrl,
      article_slug: config.articleSlug,
      referrer: document.referrer || '',
      visitor_id: visitorId,
      session_id: sessionId,
      fbp: decodeURIComponent(getCookie('_fbp') || ''),
      fbc: decodeURIComponent(getCookie('_fbc') || ''),
      utm,
      query,
      device: device()
    }, extra);
    const customData = {
      content_type: payload.content_type || 'article',
      content_name: payload.content_name || config.articleTitle,
      article_slug: config.articleSlug,
      source_url: window.location.href
    };
    pixelTrack(eventType, eventName, eventId, customData);
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.trackUrl, body);
    } else {
      fetch(config.trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'same-origin',
        keepalive: true
      }).catch(() => {});
    }
  };

  window.AEOAnalytics = {
    context() {
      return { visitorId, sessionId, landingUrl, query, utm, device: device() };
    },
    trackLead(eventId, extra = {}) {
      postEvent('LEAD', config.eventMap.lead, eventId || uuid(), Object.assign({
        content_type: 'lead',
        content_name: extra.funnelSlug || config.articleTitle
      }, extra));
    },
    trackEvent: postEvent
  };

  postEvent('ARTICLE_OPEN', config.eventMap.articleOpen, uuid(), {
    content_type: 'article',
    content_name: config.articleTitle
  });

  let deepReadSent = false;
  let timeReady = false;
  const threshold = Math.max(10, Math.min(100, Number(config.deepReadScrollPercent) || 70));
  const maybeDeepRead = () => {
    if (deepReadSent || !timeReady) return;
    const doc = document.documentElement;
    const body = document.body;
    const scrollHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0, window.innerHeight);
    const percent = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / scrollHeight) * 100));
    if (percent < threshold) return;
    deepReadSent = true;
    postEvent('DEEP_READ', config.eventMap.deepRead, uuid(), {
      content_type: 'article',
      content_name: config.articleTitle,
      scroll_percent: percent,
      seconds_on_page: Math.max(1, Math.round((performance.now ? performance.now() : 0) / 1000))
    });
  };
  setTimeout(() => {
    timeReady = true;
    maybeDeepRead();
  }, Math.max(1, Number(config.deepReadSeconds) || 45) * 1000);
  window.addEventListener('scroll', maybeDeepRead, { passive: true });
  window.addEventListener('resize', maybeDeepRead);
})();
</script>`;
}

function themeCss(blog: Blog) {
  return `<style>
:root{--primary:${blog.primaryColor};--accent:${blog.accentColor};--ink:#172033;--muted:#5c687a;--line:#dfe6f0;--shell:#f5f7fb;--paper:#fff;--gold:#ad7a1b}
*{box-sizing:border-box}
body{margin:0;font-family:${escapeHtml(blog.fontFamily)};background:var(--shell);color:var(--ink)}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
.site-header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);border-bottom:1px solid var(--line);backdrop-filter:blur(10px);display:flex;justify-content:space-between;gap:18px;align-items:center;padding:14px clamp(16px,4vw,42px)}
.brand{font-weight:950;color:var(--ink);display:inline-flex;align-items:center;min-height:40px;max-width:260px}
.brand.has-logo{height:44px}
.brand-logo{display:block;width:auto;height:auto;max-width:220px;max-height:44px;object-fit:contain}
nav{display:flex;gap:16px;font-size:14px}
main{max-width:1060px;margin:0 auto;padding:30px 16px 56px}
.index-head{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding:18px 0 24px;margin-bottom:22px}
.article-search{display:grid;gap:7px;margin-top:18px;max-width:780px}
.article-search span{color:var(--muted);font-size:13px;font-weight:900}
.article-search input{appearance:none;background:#fff;border:1px solid var(--line);border-radius:8px;color:var(--ink);font:inherit;font-size:17px;min-height:52px;padding:12px 14px;width:100%;box-shadow:0 10px 24px rgba(23,32,51,.05)}
.article-search input:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 16%,transparent);outline:none}
.article-search-empty{background:#fff;border:1px solid var(--line);border-radius:8px;margin:0;padding:18px;text-align:center}
.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:900;margin:0 0 8px}
h1{font-size:clamp(34px,6vw,66px);line-height:1.02;margin:0 0 14px;letter-spacing:0}
h2{font-size:26px;line-height:1.15;margin:30px 0 10px;letter-spacing:0}
p{font-size:18px;line-height:1.65;color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:8px;overflow:hidden;box-shadow:0 12px 30px rgba(23,32,51,.06)}
.card-body{padding:16px}
.card-image{aspect-ratio:16/9;background:#e9eff7;display:block;overflow:hidden}
.card-image img{display:block;height:100%;object-fit:cover;width:100%}
.card h2{font-size:20px;margin:0 0 8px}
.card p{font-size:15px;line-height:1.45;margin:0 0 12px}
.card-meta{align-items:center;color:var(--muted);display:flex;flex-wrap:wrap;font-size:13px;font-weight:850;gap:7px;margin:0 0 9px}
.card-meta span+span:before{content:"";display:inline-block;width:4px;height:4px;border-radius:999px;background:#b3bfce;margin:0 7px 2px 0}
.tagline{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.tag{border:1px solid color-mix(in srgb,var(--accent) 25%,white);color:var(--accent);border-radius:999px;font-size:12px;font-weight:800;padding:5px 8px}
.article{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:clamp(18px,4vw,46px);box-shadow:0 12px 34px rgba(23,32,51,.07)}
.article-head{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:24px}
.article-head p{max-width:760px}
.hero-image{width:100%;height:auto;max-height:520px;object-fit:cover;border-radius:8px;margin:0 0 24px;display:block}
.byline{font-size:14px;color:var(--muted);font-weight:800}
.content-body{font-size:18px;line-height:1.72}
.content-body h2,.content-body h3{scroll-margin-top:90px}
.content-body img{max-width:100%;height:auto;border-radius:8px}
.content-body blockquote{border-left:4px solid var(--accent);margin-left:0;padding-left:18px;color:var(--muted)}
.content-body table{width:100%;border-collapse:collapse;margin:22px 0;background:#fff}
.content-body th,.content-body td{border:1px solid var(--line);padding:10px;text-align:left}
.related{margin-top:28px}
.site-footer{border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:14px;padding:22px clamp(16px,4vw,42px);color:var(--muted);font-size:13px}
@media(max-width:820px){.cards{grid-template-columns:1fr}.site-header,.site-footer{align-items:flex-start;flex-direction:column}.index-head{display:block}.article-search input{font-size:16px}}
</style>`;
}

function articleCard(blog: Blog, article: ArticleWithTags, options: RenderOptions, mediaMap: BuildMediaMap = {}) {
  const imageUrl = articleCardImageUrl(article, mediaMap);
  const publishedAt = article.publishedAt || article.createdAt;
  return `<article class="card" data-article-card data-title="${escapeAttribute(article.title.toLocaleLowerCase())}">
    ${imageUrl ? `<a class="card-image" href="${escapeAttribute(articlePath(blog, article, options))}"><img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(article.heroAlt || article.title)}" loading="lazy" /></a>` : ""}
    <div class="card-body">
      <div class="card-meta"><span>${escapeHtml(article.authorName || blog.defaultAuthorName)}</span><span>${escapeHtml(formatDate(publishedAt))}</span></div>
      <h2><a href="${escapeAttribute(articlePath(blog, article, options))}">${escapeHtml(article.title)}</a></h2>
      <p>${escapeHtml(article.excerpt || article.metaDescription || stripHtml(article.markdown).slice(0, 150))}</p>
      <div class="tagline">${article.tags.map((entry) => `<a class="tag" href="${escapeAttribute(tagPath(blog, entry.tag, options))}">${escapeHtml(entry.tag.name)}</a>`).join("")}</div>
    </div>
  </article>`;
}

function articleCardImageUrl(article: ArticleWithTags, mediaMap: BuildMediaMap) {
  if (article.heroMediaId && mediaMap[article.heroMediaId]) return mediaMap[article.heroMediaId];
  const source = firstMarkdownImageSourceAnywhere(article.markdown);
  if (!source) return null;
  if (mediaMap[source]) return mediaMap[source];
  const mediaId = source.match(/^media:(.+)$/)?.[1];
  if (mediaId && mediaMap[mediaId]) return mediaMap[mediaId];
  if (/^https?:\/\//i.test(source)) return source;
  return null;
}

function articleSearchScript() {
  return `<script>
(() => {
  const input = document.getElementById("article-search-input");
  const cards = Array.from(document.querySelectorAll("[data-article-card]"));
  const empty = document.querySelector("[data-search-empty]");
  if (!input || cards.length === 0) return;
  const filter = () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const title = String(card.getAttribute("data-title") || "");
      const match = !query || title.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
  };
  input.addEventListener("input", filter);
})();
</script>`;
}

function matchingFunnelEmbed(
  blog: Blog,
  article: ArticleWithTags,
  funnels: FunnelWithRules[],
  endpoint: PublicWebhookEndpoint,
  webhookSecret: string,
  mediaMap: BuildMediaMap,
  imageSourceMap: BuildImageSourceMap,
  options: RenderOptions
) {
  const articleTagSlugs = article.tags.map((entry) => entry.tag.slug);
  const matches: Array<{ funnel: FunnelWithRules; rule: FunnelPlacementRule }> = [];
  for (const funnel of funnels) {
    for (const rule of funnel.placementRules) {
      if (placementRuleMatches(rule, blog.id, articleTagSlugs)) {
        matches.push({ funnel, rule });
      }
    }
  }

  const winner = matches.sort((a, b) => {
    const priority = a.rule.priority - b.rule.priority;
    if (priority !== 0) return priority;
    return b.rule.createdAt.getTime() - a.rule.createdAt.getTime();
  })[0];

  if (winner) {
    return {
      placement: winner.rule.placement,
      html: renderFunnelHtml({
        funnel: winner.funnel,
        endpoint,
        webhookSecret,
        mediaMap: { ...imageSourceMap, ...mediaMap },
        embedded: true,
        publicBasePath: publicPath(blog),
        directPhpEndpoints: !options.htaccessEnabled,
      }),
    };
  }
  return null;
}

function placementRuleMatches(rule: FunnelPlacementRule, blogId: string, articleTagSlugs: string[]) {
  if (rule.blogId !== blogId || !rule.enabled) return false;
  const required = Array.isArray(rule.tagSlugsJson)
    ? rule.tagSlugsJson.map((slug) => String(slug).trim().toLowerCase()).filter(Boolean)
    : [];
  if (required.length === 0) return true;
  const articleTags = articleTagSlugs.map((slug) => slug.toLowerCase());
  return rule.matchMode === "ALL_TAGS"
    ? required.every((slug) => articleTags.includes(slug))
    : required.some((slug) => articleTags.includes(slug));
}

function injectFunnel(html: string, embed: string, placement: string) {
  const paragraphs = html.split("</p>");
  if (paragraphs.length < 2) return `${html}${embed}`;
  const index =
    placement === "AFTER_INTRO"
      ? 1
      : placement === "MIDDLE"
        ? Math.max(1, Math.floor(paragraphs.length / 2))
        : placement === "BEFORE_CONCLUSION"
          ? Math.max(1, paragraphs.length - 2)
          : paragraphs.length - 1;
  paragraphs.splice(index, 0, embed);
  return paragraphs.join("</p>");
}

function uniqueTags(articles: ArticleWithTags[]) {
  const tags = new Map<string, Tag>();
  for (const article of articles) {
    for (const entry of article.tags) tags.set(entry.tag.slug, entry.tag);
  }
  return Array.from(tags.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function publicPath(blog: Blog, itemPath = "") {
  const basePath = new URL(blog.baseUrl).pathname.replace(/\/+$/, "");
  const cleanPath = itemPath.replace(/^\/+/, "");
  if (!cleanPath) return `${basePath || ""}/`;
  return `${basePath || ""}/${cleanPath}`;
}

function articlePath(blog: Blog, article: Pick<Article, "slug">, options: RenderOptions) {
  return publicPath(blog, options.cleanUrls ? `${article.slug}/` : `${article.slug}.html`);
}

function tagPath(blog: Blog, tag: Pick<Tag, "slug">, options: RenderOptions) {
  return publicPath(blog, options.cleanUrls ? `tags/${tag.slug}/` : `tags/${tag.slug}.html`);
}

function articleCanonicalUrl(blog: Blog, article: Pick<Article, "slug" | "canonicalUrl">, options: RenderOptions) {
  const cleanUrl = canonicalArticleUrl(blog.baseUrl, article.slug, true);
  const htmlUrl = canonicalArticleUrl(blog.baseUrl, article.slug, false);
  if (article.canonicalUrl && !isManagedArticleCanonical(blog, article.slug, article.canonicalUrl)) {
    return article.canonicalUrl;
  }
  return options.cleanUrls ? cleanUrl : htmlUrl;
}

function isManagedArticleCanonical(blog: Blog, slug: string, value: string) {
  try {
    const candidate = new URL(value);
    const blogUrl = new URL(blog.baseUrl);
    if (candidate.origin !== blogUrl.origin) return false;
    const lastSegment = candidate.pathname.replace(/\/+$/, "").split("/").pop();
    return lastSegment === slug || lastSegment === `${slug}.html`;
  } catch {
    return false;
  }
}

function publicAssetMap<T extends Record<string, string>>(blog: Blog, map: T): T {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, value.startsWith("/") ? publicPath(blog, value) : value])
  ) as T;
}

function absolutePublicUrl(blog: Blog, value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  const origin = new URL(blog.baseUrl).origin;
  return joinUrl(origin, value.replace(/^\/+/, ""));
}

function renderSitemap(blog: Blog, articles: ArticleWithTags[], funnels: FunnelWithRules[], options: RenderOptions) {
  const urls = [
    blog.baseUrl,
    ...articles.map((article) => articleCanonicalUrl(blog, article, options)),
    ...uniqueTags(articles).map((tag) => joinUrl(blog.baseUrl, options.cleanUrls ? `tags/${tag.slug}/` : `tags/${tag.slug}.html`)),
    ...funnels.map((funnel) => joinUrl(blog.baseUrl, `forms/${funnel.slug}.html`)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>`;
}

function renderRss(blog: Blog, articles: ArticleWithTags[], options: RenderOptions) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(blog.brandName)}</title>
  <link>${escapeHtml(blog.baseUrl)}</link>
  <description>${escapeHtml(blog.brandName)} articles</description>
${articles
  .map(
    (article) => `  <item>
    <title>${escapeHtml(article.title)}</title>
    <link>${escapeHtml(articleCanonicalUrl(blog, article, options))}</link>
    <guid>${escapeHtml(articleCanonicalUrl(blog, article, options))}</guid>
    <pubDate>${(article.publishedAt || article.createdAt).toUTCString()}</pubDate>
    <description>${escapeHtml(article.excerpt || article.metaDescription || "")}</description>
  </item>`
  )
  .join("\n")}
</channel>
</rss>`;
}

function renderRobots(blog: Blog) {
  return `User-agent: *
Allow: /

Sitemap: ${joinUrl(blog.baseUrl, "sitemap.xml")}
`;
}

function renderHtaccess(blog: Blog) {
  const basePath = rewriteBasePath(blog.baseUrl);
  const rewriteBase = `${basePath || ""}/`;
  const requestPrefix = basePath.replace(/^\/+/, "");
  const requestPattern = requestPrefix ? `${escapeApacheRegex(requestPrefix)}/` : "";
  const slashTarget = basePath ? `${basePath}/$1/` : "/$1/";

  return `RewriteEngine On
RewriteBase ${rewriteBase}

RewriteRule ^forms/([a-z0-9-]+)-submit\\.html$ forms/$1-submit.php [L,QSA]
RewriteRule ^track/collect\\.html$ track/collect.php [L,QSA]
RewriteRule ^_aeo-private/ - [F,L]

# 1. Redirect .html -> clean URL with trailing slash
RewriteCond %{REQUEST_URI} !^${escapeApacheRegex(basePath || "")}/forms/ [NC]
RewriteCond %{REQUEST_URI} !^${escapeApacheRegex(basePath || "")}/track/ [NC]
RewriteCond %{THE_REQUEST} \\s/+${requestPattern}(.+?)\\.html[\\s?] [NC]
RewriteRule ^ %1/ [R=301,L,NE]

# 2. Add trailing slash
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_URI} !/$
RewriteRule ^(.+)$ ${slashTarget} [R=301,L]

# 3. Internally serve the real .html file
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.+?)/?$ $1.html [L]
`;
}

function rewriteBasePath(baseUrl: string) {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "");
  return pathname === "/" ? "" : pathname;
}

function escapeApacheRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
