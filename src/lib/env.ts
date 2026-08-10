export function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

export function publicWebhookBaseUrl() {
  return (process.env.PUBLIC_WEBHOOK_BASE_URL || appUrl()).replace(/\/+$/, "");
}

export function storageDir() {
  return process.env.STORAGE_DIR || "./storage";
}

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function devFallbackEnv(name: string, fallback: string) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return fallback;
}
