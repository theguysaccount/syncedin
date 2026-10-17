import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapePublicProfile } from "@/lib/scrape";
import { exaGetContents } from "@/lib/exa";

/**
 * Auth-gated diagnostic endpoint for the bulk-invite scraper chain.
 *
 * POST { url: "https://instagram.com/sydneythackray" }
 *  →  {
 *       url,
 *       exa:   { ok, length, preview, error? },
 *       apify: { ok, length, preview, status, raw_preview, error? },
 *       final: { ok, length, preview, error? }
 *     }
 *
 * Lets us see whether Exa returned anything, whether Apify reached the
 * actor, what the raw payload looks like, and what the public chain ended
 * up returning. Hit it from the browser as a signed-in user.
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN;

function isXUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?(?:twitter|x)\.com\//i.test(url);
}
function isInstagramUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?instagram\.com\//i.test(url);
}

function handleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs[0] || null;
  } catch {
    return null;
  }
}

async function rawApifyCall(actor: string, input: Record<string, unknown>) {
  if (!APIFY_TOKEN) {
    return { ok: false, status: 0, error: "APIFY_TOKEN missing", body: "" };
  }
  const slug = actor.replace("/", "~");
  const url =
    `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(APIFY_TOKEN)}&timeout=60&memory=1024&format=json`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch (e: any) {
    return { ok: false, status: 0, error: String(e?.message ?? e), body: "" };
  }
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, error: res.ok ? null : body.slice(0, 400), body };
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // 1) Exa attempt
  const exa: Record<string, unknown> = { ok: false, length: 0, preview: "" };
  try {
    const t = await exaGetContents(url);
    exa.ok = true;
    exa.length = t.length;
    exa.preview = t.slice(0, 600);
  } catch (e: any) {
    exa.error = String(e?.message ?? e);
  }

  // 2) Apify attempt (per-platform)
  const apify: Record<string, unknown> = {
    ok: false,
    status: 0,
    length: 0,
    preview: "",
    raw_preview: "",
    token_present: !!APIFY_TOKEN
  };
  if (isInstagramUrl(url)) {
    const handle = handleFromUrl(url) || "";
    apify.handle = handle;
    apify.actor = "apify/instagram-scraper";
    // Use the broader free-tier-compatible actor with directUrls.
    const r = await rawApifyCall("apify/instagram-scraper", {
      directUrls: [url],
      resultsType: "details",
      resultsLimit: 5,
      addParentData: false
    });
    apify.status = r.status;
    apify.raw_preview = (r.body || "").slice(0, 1200);
    if (r.ok) {
      apify.ok = true;
      apify.length = (r.body || "").length;
      apify.preview = (r.body || "").slice(0, 600);
    } else {
      apify.error = r.error;
    }
  } else if (isXUrl(url)) {
    const handle = handleFromUrl(url) || "";
    apify.handle = handle;
    apify.actor = "apidojo/tweet-scraper";
    const r = await rawApifyCall("apidojo/tweet-scraper", {
      twitterHandles: [handle],
      maxItems: 25,
      sort: "Latest"
    });
    apify.status = r.status;
    apify.raw_preview = (r.body || "").slice(0, 1200);
    if (r.ok) {
      apify.ok = true;
      apify.length = (r.body || "").length;
      apify.preview = (r.body || "").slice(0, 600);
    } else {
      apify.error = r.error;
    }
  } else {
    apify.skipped = "not an X or Instagram URL";
  }

  // 3) Public chain (what bulk-invite actually uses)
  const final: Record<string, unknown> = { ok: false, length: 0, preview: "" };
  try {
    const t = await scrapePublicProfile(url);
    final.ok = true;
    final.length = t.length;
    final.preview = t.slice(0, 600);
  } catch (e: any) {
    final.error = String(e?.message ?? e);
  }

  return NextResponse.json({ url, exa, apify, final });
}
