import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Start a new call inside an existing conversation.
 *
 * Body: { conversation_id, kind: "audio" | "video" }
 *
 * Creates a calls row, generates a Jitsi room slug deterministic to the
 * conversation + timestamp (so both participants land in the same room
 * when they tap "Join call"), and returns:
 *   { call_id, room_id, jitsi_url, board_url }
 *
 * The client opens jitsi_url in an iframe + board_url in a sibling
 * iframe. Jitsi is free + needs no API key; tldraw is also free + open.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversation_id = (body.conversation_id ?? "").trim();
  if (!conversation_id) {
    return NextResponse.json({ error: "missing_conversation_id" }, { status: 400 });
  }
  const kind = body.kind === "audio" ? "audio" : "video";

  const service = createServiceClient();

  // Verify the caller is a participant in this conversation. RLS would
  // also enforce this on insert, but we want a clean 403 instead of a
  // confusing PostgREST policy error.
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversation_id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }

  // Deterministic-ish room id. Short prefix + ts so collisions across
  // conversations are effectively zero. We DO want a fresh room per
  // call (instead of reusing the same room across days) so a stale
  // Jitsi session doesn't leak old whiteboard state into a new call.
  const room_id = `syncedin-${conversation_id.slice(0, 8)}-${Date.now().toString(36)}`;

  const insertPayload: Record<string, any> = {
    conversation_id,
    room_id,
    kind,
    started_by: user.id
  };

  const { data: row, error } = await service
    .from("calls")
    .insert(insertPayload)
    .select("id, room_id, kind, started_at")
    .single();

  if (error) {
    // Friendly message when calls table isn't migrated yet on this DB.
    if (/calls|schema cache|relation.*does not exist/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Your DB needs the new calls table. Run the SQL from supabase/schema.sql (the calls block) once in Supabase → SQL Editor, then try again."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  // Jitsi public meet — free, embeddable, no signup. Self-hosting or
  // swapping to LiveKit Cloud is a config-only swap later.
  const jitsi_url = `https://meet.jit.si/${encodeURIComponent(row.room_id)}`;
  // tldraw multiplayer rooms — free, no signup, ephemeral but persists
  // for a few weeks. Same room id seeds the same board on both sides.
  const board_url = `https://www.tldraw.com/r/${encodeURIComponent(row.room_id)}`;

  return NextResponse.json({
    call_id: row.id,
    room_id: row.room_id,
    kind: row.kind,
    jitsi_url,
    board_url
  });
}
