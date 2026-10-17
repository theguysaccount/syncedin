import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Admin-only ack endpoint. Marks one or many feedback rows as
 * "already handed off / paste-shared with Claude." Two modes:
 *
 *   { ids: [uuid, ...] }              — ack specific rows
 *   { signatures: [sig, ...] }        — ack EVERY row whose computed
 *                                       signature matches (so a 12x
 *                                       group acks all 12 in one call)
 *
 * Gated to jacksonjezio@gmail.com.
 */
const ADMIN_EMAIL = "jacksonjezio@gmail.com";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { ids?: string[]; signatures?: string[]; unack?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === "string") : [];
  const sigs = Array.isArray(body.signatures)
    ? body.signatures.filter((s) => typeof s === "string")
    : [];
  if (ids.length === 0 && sigs.length === 0) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }

  const service = createServiceClient();
  const stamp = body.unack ? null : new Date().toISOString();

  let acked = 0;
  if (ids.length > 0) {
    const { data } = await service
      .from("feedback")
      .update({ acked_at: stamp })
      .in("id", ids)
      .select("id");
    acked += (data ?? []).length;
  }
  if (sigs.length > 0) {
    const { data } = await service
      .from("feedback")
      .update({ acked_at: stamp })
      .in("ack_signature", sigs)
      .select("id");
    acked += (data ?? []).length;
  }
  return NextResponse.json({ ok: true, acked });
}
