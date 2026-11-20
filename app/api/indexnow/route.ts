import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { canonicalIndexNowUrls, indexNowPayload, INDEXNOW_ENDPOINT } from "@/lib/indexnow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const OWNER_EMAIL = "jacksonjezio@gmail.com";
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

export function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405, headers: { ...HEADERS, allow: "POST" } });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  }
  let user: User | null;
  try {
    const client = await createClient();
    const result = await client.auth.getUser();
    user = result.data.user;
  } catch {
    return NextResponse.json({ error: "authentication_unavailable" }, { status: 503, headers: HEADERS });
  }
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });
  if ((user.email || "").toLowerCase() !== OWNER_EMAIL || !user.email_confirmed_at) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > 32_000) {
      return NextResponse.json({ error: "batch_too_large" }, { status: 413, headers: HEADERS });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: HEADERS });
  }
  const urls = canonicalIndexNowUrls(body && typeof body === "object" && !Array.isArray(body) ? (body as { urls?: unknown }).urls : null);
  if (!urls) return NextResponse.json({ error: "invalid_public_url_batch" }, { status: 400, headers: HEADERS });

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(urls)),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (response.status !== 200 && response.status !== 202) {
      return NextResponse.json({ error: "notification_not_confirmed", upstreamStatus: response.status }, { status: 502, headers: HEADERS });
    }
    return NextResponse.json({
      notificationStatus: response.status === 202 ? "key_validation_pending" : "received",
      notifiedURLs: urls.length,
      indexing: "not_verified",
    }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: "notification_not_confirmed" }, { status: 502, headers: HEADERS });
  }
}
