import { z } from "zod";

export const blogInputSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  baseUrl: z.string().url(),
  status: z.enum(["ACTIVE", "PAUSED"]).default("ACTIVE"),
  domainMode: z.enum(["SUBFOLDER", "SUBDOMAIN_ROOT"]).default("SUBFOLDER"),
  language: z.string().default("en"),
  timezone: z.string().default("America/Chicago"),
  brandName: z.string().min(1),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
  fontFamily: z.string().min(1).default("Inter, ui-sans-serif, system-ui"),
  defaultAuthorName: z.string().min(1).default("Editorial Team"),
  defaultAuthorBio: z.string().optional().nullable(),
  organizationName: z.string().optional().nullable(),
  robotsPolicy: z.string().default("index,follow"),
  indexNowEnabled: z.boolean().default(false),
  indexNowKey: z.string().optional().nullable(),
});

export const deploymentTargetInputSchema = z.object({
  type: z.enum(["SFTP", "FTP", "FTPS"]),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().optional().nullable(),
  privateKey: z.string().optional().nullable(),
  privateKeyPassphrase: z.string().optional().nullable(),
  remoteRootPath: z.string().min(1).default("/"),
  cleanUrlMode: z.enum(["HTML", "HTACCESS_DIRECTORY"]).default("HTACCESS_DIRECTORY"),
  phpEnabled: z.boolean().default(true),
  htaccessEnabled: z.boolean().default(true),
});

export type BlogInput = z.infer<typeof blogInputSchema>;
export type DeploymentTargetInput = z.infer<typeof deploymentTargetInputSchema>;
