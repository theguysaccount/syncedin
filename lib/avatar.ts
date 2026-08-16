/**
 * Route a scraped profile photo through our own origin.
 *
 * Scraped avatars live on CDNs that block cross-origin hotlinking
 * (media.licdn.com, cdninstagram.com, ...), so rendering the raw URL gives
 * a broken image in the browser and an empty circle on the OG card. The
 * /api/avatar proxy fetches it server-side and re-serves it same-origin.
 *
 * Photos we host ourselves (Supabase storage, relative paths, data URIs)
 * are passed through untouched — no reason to add a hop.
 */
export function proxiedAvatar(
  url: string | null | undefined,
  /** Absolute base, required when the consumer is server-rendered (OG card). */
  siteUrl?: string
): string | null {
  const raw = (url || "").trim();
  if (!raw) return null;
  // Already local / inline: leave alone.
  if (raw.startsWith("/") || raw.startsWith("data:")) return raw;
  if (!/^https?:\/\//i.test(raw)) return null;

  try {
    const host = new URL(raw).hostname.toLowerCase();
    // Our own Supabase-hosted uploads don't need proxying.
    if (host.endsWith("supabase.co") && raw.includes("/storage/v1/object/public/")) {
      return raw;
    }
  } catch {
    return null;
  }

  const base = (siteUrl || "").replace(/\/$/, "");
  return `${base}/api/avatar?url=${encodeURIComponent(raw)}`;
}
