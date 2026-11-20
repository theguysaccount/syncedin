import cards from "@/verification/social-card-manifest.json";

export const INDEXNOW_HOST = "syncedin.org";
export const INDEXNOW_KEY = "8e7c4f3a2b1d9e6f5c8a7b4d2e9f1c3a";
export const INDEXNOW_ENDPOINT = "https://www.bing.com/indexnow";
export const INDEXNOW_BATCH_LIMIT = 100;
const ORIGIN = `https://${INDEXNOW_HOST}`;
const PUBLIC_PATHS = new Set(["/", ...cards.map(card => card.path)]);

export function canonicalIndexNowUrls(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > INDEXNOW_BATCH_LIMIT) return null;
  const urls = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string" || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash || !PUBLIC_PATHS.has(url.pathname)) return null;
      if (value !== url.href && value !== ORIGIN) return null;
      urls.add(url.href);
    } catch {
      return null;
    }
  }
  return [...urls];
}

export function indexNowPayload(urls: string[]) {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}
