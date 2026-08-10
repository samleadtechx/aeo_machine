import { z } from "zod";

export const outboundWebhookInputSchema = z.object({
  blogId: z.string().nullable().optional(),
  name: z.string().min(2),
  enabled: z.boolean().default(true),
  url: z.string().url(),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  headers: z.record(z.string()).default({}),
  signingSecret: z.string().optional().nullable(),
});

export const outboundWebhookPatchSchema = outboundWebhookInputSchema.partial();

export type OutboundWebhookInput = z.infer<typeof outboundWebhookInputSchema>;

export function parseHeaderLines(value: string) {
  const headers: Record<string, string> = {};
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new Error(`Invalid header line: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    const headerValue = line.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9-]+$/.test(key)) {
      throw new Error(`Invalid header name: ${key}`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

export function formatHeaderLines(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}
