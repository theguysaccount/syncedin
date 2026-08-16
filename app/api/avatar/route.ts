import { NextResponse } from "next/server";

/**
 * Avatar proxy.
 *
 * Scraped profile photos come from CDNs that refuse cross-origin hotlinks
 * (LinkedIn's media.licdn.com is the main offender; Instagram's
 * scontent.* behaves the same). Rendering those URLs directly meant:
 *   - a broken-image glyph in the bulk-reach toolkit, and
 *   - an empty circle on the OG invite card (Satori fetches server-side
 *     and gets a 403 back).
 *
 * Fetching server-side and re-serving from our own origin sidesteps both:
 * the CDN sees a normal request with no foreign Referer, and the browser /
 * Satori only ever sees a same-origin image.
 *
 * Hardened: https only, host allowlist, size cap, content-type must be an
 * image. On any failure we 302 to the local placeholder so callers never
 * render a broken glyph.
 */
export const runtime = "nodejs";

// Hosts we knowingly pull profile photos from (scrape pipeline output).
// Suffix match, so CDN shards (scontent-lax3-1.cdninstagram.com) pass.
const ALLOWED_SUFFIXES = [
  "licdn.com",
  "cdninstagram.com",
  "fbcdn.net",
  "twimg.com",
  "pbs.twimg.com",
  "googleusercontent.com",
  "githubusercontent.com",
  "gravatar.com",
  "cloudfront.net",
  "amazonaws.com",
  "unavatar.io",
  "supabase.co"
];

const MAX_BYTES = 8 * 1024 * 1024; // 8MB ceiling

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  // Exact match or a true DOT-delimited subdomain only. A bare endsWith
  // would allow "evillicdn.com" to pass as "licdn.com".
  return ALLOWED_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

/**
 * Neutral silhouette served when the upstream photo can't be fetched.
 * Inline SVG (not a redirect to a static file) so the proxy has no external
 * dependency and can never 404 into a broken glyph.
 */
function placeholder(): NextResponse {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1f8bff"/><stop offset="100%" stop-color="#6b2dc9"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="78" r="34" fill="#ffffff" opacity="0.9"/><path d="M100 124c-33 0-60 21-60 47v29h120v-29c0-26-27-47-60-47z" fill="#ffffff" opacity="0.9"/></svg>`;
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600"
    }
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url") || "";
  const fallback = placeholder();

  if (!raw) return fallback;

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return fallback;
  }
  if (target.protocol !== "https:") return fallback;
  if (!hostAllowed(target.hostname)) return fallback;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // No Referer on purpose — that's what trips the hotlink block.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) return fallback;

    const type = upstream.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return fallback;

    const len = Number(upstream.headers.get("content-length") || "0");
    if (len && len > MAX_BYTES) return fallback;

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return fallback;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": type,
        "content-length": String(buf.byteLength),
        // Long cache: these photos rarely change, and the signed upstream
        // URL usually expires long before this does.
        "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return fallback;
  }
}
