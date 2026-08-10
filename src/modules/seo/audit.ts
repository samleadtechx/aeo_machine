import type { Article, Blog, Tag } from "@prisma/client";
import { canonicalArticleUrl } from "@/lib/utils/url";

export type SeoAuditIssueResult = {
  severity: "BLOCKER" | "WARNING" | "INFO";
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type SeoAuditResult = {
  status: "PASS" | "FAIL" | "WARNING";
  score: number;
  issues: SeoAuditIssueResult[];
};

type ArticleForAudit = Pick<
  Article,
  | "title"
  | "slug"
  | "markdown"
  | "metaTitle"
  | "metaDescription"
  | "canonicalUrl"
  | "heroMediaId"
  | "heroAlt"
  | "authorName"
  | "schemaJson"
>;

export function auditArticleSeo(
  article: ArticleForAudit,
  blog: Pick<Blog, "baseUrl" | "defaultAuthorName">,
  tags: Pick<Tag, "slug" | "name">[] = []
): SeoAuditResult {
  const issues: SeoAuditIssueResult[] = [];
  const markdown = article.markdown?.trim() ?? "";
  const metaDescription = article.metaDescription?.trim() ?? "";
  const canonical = article.canonicalUrl?.trim() || (article.slug ? canonicalArticleUrl(blog.baseUrl, article.slug) : "");

  const blocker = (code: string, message: string, details?: Record<string, unknown>) =>
    issues.push({ severity: "BLOCKER", code, message, details });
  const warning = (code: string, message: string, details?: Record<string, unknown>) =>
    issues.push({ severity: "WARNING", code, message, details });

  if (!article.title?.trim()) blocker("missing_title", "Article title is required.");
  if (!article.slug?.trim()) blocker("missing_slug", "Article slug is required.");
  if (!article.metaTitle?.trim()) blocker("missing_meta_title", "Meta title is required.");
  if (!metaDescription) {
    blocker("missing_meta_description", "Meta description is required.");
  } else if (metaDescription.length < 90 || metaDescription.length > 165) {
    blocker("meta_description_length", "Meta description should be 90-165 characters.", {
      length: metaDescription.length,
    });
  }
  if (!canonical) blocker("missing_canonical", "Canonical URL is required.");
  if (!markdown) blocker("missing_body", "Article body cannot be empty.");
  if (article.heroMediaId && !article.heroAlt?.trim()) {
    blocker("missing_hero_alt", "Hero image alt text is required when a hero image is selected.");
  }
  if (!(article.authorName?.trim() || blog.defaultAuthorName?.trim())) {
    blocker("missing_author", "Article author is required.");
  }
  if (tags.length === 0) blocker("missing_tags", "At least one tag is required.");
  if (article.schemaJson) {
    try {
      JSON.stringify(article.schemaJson);
    } catch {
      blocker("invalid_json_ld", "Schema JSON-LD must be valid JSON.");
    }
  }
  if (markdown.length > 0 && markdown.length < 900) {
    warning("thin_body", "Article body is thin for SEO/AEO purposes.", { characters: markdown.length });
  }
  if (!/##\s+FAQ|###\s+FAQ|Frequently Asked Questions/i.test(markdown)) {
    warning("missing_faq", "Consider adding a visible FAQ section before adding FAQ schema.");
  }
  if (!/\[[^\]]+\]\((https?:\/\/|\/)[^)]+\)/.test(markdown)) {
    warning("no_citations_or_links", "Consider adding relevant internal links or citations.");
  }

  const blockerCount = issues.filter((issue) => issue.severity === "BLOCKER").length;
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;
  const score = Math.max(0, 100 - blockerCount * 18 - warningCount * 5);
  return {
    status: blockerCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS",
    score,
    issues,
  };
}
