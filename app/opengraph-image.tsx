/**
 * OG image route — serves the animated GIF extracted from Jack's
 * uploaded hero video (see /public/social/syncedin-preview.gif).
 *
 * History: ImageResponse → static JPG → now GIF bytes. Jack: "having
 * the GIF across the board, unless we have a different custom social
 * preview image for that page, is best." iMessage, Slack, Discord,
 * Telegram, Twitter all animate GIFs inside preview cards. LinkedIn
 * + WhatsApp show the first frame as a static, which is acceptable.
 *
 * The auto-routed file convention overrides metadata.openGraph.images
 * in layout.tsx, so to switch what's served you change the bytes
 * THIS file returns — not the metadata.
 *
 * If we ever need a per-page card (e.g. /conversations/[id] showing
 * the deal text), add a page-level `generateMetadata` with explicit
 * `openGraph.images` — that override beats the file convention.
 */

export const runtime = "edge";
export const alt =
  "SyncedIn — two twins finding the highest-leverage win-win between you.";
export const size = { width: 600, height: 338 };
export const contentType = "image/gif";

export default async function OG(): Promise<Response> {
  const SITE_URL =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";
  const res = await fetch(`${SITE_URL}/social/syncedin-preview.gif`, {
    next: { revalidate: 60 * 60 * 24 * 7 }
  });
  if (!res.ok) {
    // 1×1 transparent PNG fallback so og:image is never broken.
    return new Response(
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
      ]),
      { headers: { "content-type": "image/png" } }
    );
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      "content-type": "image/gif",
      "cache-control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"
    }
  });
}
