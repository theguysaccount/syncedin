import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { funnelCollectionAllowed, sanitizeFunnelEvent } from "@/lib/funnel-events";

/**
 * Funnel event sink. Fire-and-forget beacons from the front doors land
 * here (see lib/track.ts). Designed to NEVER break a product flow:
 * any failure (table missing before the 0003 migration runs, bad
 * payload, env missing) still returns 204. Inserts use the service
 * role so RLS stays fully closed to the public.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 8192;

async function readPayload(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > MAX_BYTES || !req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request) {
  try {
    if (!funnelCollectionAllowed(req.url, { doNotTrack: req.headers.get("dnt"), globalPrivacyControl: req.headers.get("sec-gpc") === "1" })) return new NextResponse(null, { status: 204 });
    const origin = req.headers.get("origin");
    if ((origin && origin !== "https://syncedin.org") || req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 204 });
    const safe = sanitizeFunnelEvent(await readPayload(req));
    if (!safe) return new NextResponse(null, { status: 204 });

    let userId: string | null = null;
    try {
      const supabase = (await createClient());
      const {
        data: { user }
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      /* anonymous is fine */
    }

    const service = createServiceClient();
    if (userId) {
      const { data, error } = await service.from("profiles").select("is_test_persona").eq("id", userId).maybeSingle();
      if (error || !data || data.is_test_persona === true) return new NextResponse(null, { status: 204 });
    }
    if (!userId && ["ghost_prefill_used", "win_published"].includes(safe.event)) return new NextResponse(null, { status: 204 });
    await service.from("funnel_events").insert({
      ...safe,
      user_id: userId
    });
  } catch {
    /* never break the product for analytics */
  }
  return new NextResponse(null, { status: 204 });
}
