import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Funnel event sink. Fire-and-forget beacons from the front doors land
 * here (see lib/track.ts). Designed to NEVER break a product flow:
 * any failure (table missing before the 0003 migration runs, bad
 * payload, env missing) still returns 204. Inserts use the service
 * role so RLS stays fully closed to the public.
 */
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "view",
  "prompt_copied",
  "decode_started",
  "decode_done",
  "decode_failed",
  "claim_clicked",
  "share_clicked",
  "generate_started",
  "generate_done",
  "people_chip_clicked",
  "ghost_prefill_used",
  "win_published"
]);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const event = String(body.event ?? "").slice(0, 64);
    if (!ALLOWED.has(event)) return new NextResponse(null, { status: 204 });

    const path = String(body.path ?? "").slice(0, 200) || null;
    const anon = String(body.anon ?? "").slice(0, 64) || null;

    let meta: unknown = null;
    if (body.meta && typeof body.meta === "object") {
      // Cap stored meta at 2KB; if truncation breaks the JSON, drop it.
      const s = JSON.stringify(body.meta).slice(0, 2000);
      try {
        meta = JSON.parse(s);
      } catch {
        meta = null;
      }
    }

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
    await service.from("funnel_events").insert({
      event,
      path,
      meta,
      anon_id: anon,
      user_id: userId
    });
  } catch {
    /* never break the product for analytics */
  }
  return new NextResponse(null, { status: 204 });
}
