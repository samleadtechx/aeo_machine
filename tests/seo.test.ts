import { describe, expect, it } from "vitest";
import { auditArticleSeo } from "@/modules/seo/audit";

const blog = {
  baseUrl: "https://example.com/blog",
  defaultAuthorName: "Editor",
};

describe("SEO publishing gate", () => {
  it("blocks missing required fields", () => {
    const result = auditArticleSeo(
      {
        title: "",
        slug: "",
        markdown: "",
        metaTitle: "",
        metaDescription: "",
        canonicalUrl: "",
        heroMediaId: null,
        heroAlt: null,
        authorName: "",
        schemaJson: null,
      },
      blog,
      []
    );
    expect(result.status).toBe("FAIL");
    expect(result.issues.some((issue) => issue.code === "missing_title")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "missing_tags")).toBe(true);
  });

  it("passes blockers when required metadata exists", () => {
    const result = auditArticleSeo(
      {
        title: "A clear article",
        slug: "a-clear-article",
        markdown: "## Direct Answer\n\n" + "Useful body paragraph. ".repeat(90),
        metaTitle: "A clear article",
        metaDescription:
          "This article has enough useful metadata to pass the blocking SEO gate for publishing in the control system.",
        canonicalUrl: "https://example.com/blog/a-clear-article/",
        heroMediaId: null,
        heroAlt: null,
        authorName: "Editor",
        schemaJson: null,
      },
      blog,
      [{ name: "SEO", slug: "seo" }]
    );
    expect(result.issues.filter((issue) => issue.severity === "BLOCKER")).toHaveLength(0);
  });
});
