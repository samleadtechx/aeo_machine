import { z } from "zod";

export const articleInputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  markdown: z.string().default(""),
  excerpt: z.string().optional().nullable(),
  metaTitle: z.string().optional().nullable(),
  metaDescription: z.string().optional().nullable(),
  canonicalUrl: z.string().url().optional().nullable().or(z.literal("")),
  heroMediaId: z.string().optional().nullable(),
  heroAlt: z.string().optional().nullable(),
  authorName: z.string().optional().nullable(),
  noindex: z.boolean().default(false),
  tags: z.array(z.string().min(1)).default([]),
  source: z.enum(["MANUAL", "BABYLOVEGROWTH", "MCP", "IMPORT"]).default("MANUAL"),
  sourceExternalId: z.string().optional().nullable(),
});

export type ArticleInput = z.infer<typeof articleInputSchema>;
