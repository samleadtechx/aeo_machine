export function joinUrl(baseUrl: string, path: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

export function canonicalArticleUrl(baseUrl: string, slug: string, cleanUrls = true) {
  return cleanUrls ? joinUrl(baseUrl, `${slug}/`) : joinUrl(baseUrl, `${slug}.html`);
}

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const url = new URL(trimmed);
  return url.toString().replace(/\/+$/, "");
}
