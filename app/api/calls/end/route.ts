import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * End an in-flight call. Stamps ended_at, persists the optional
 * transcript + dream_board_state, AND appends the call as a new
 * context block on BOTH participants' twin_profiles.ai_export_blob so
 * future twin-to-twin conversations have it.
 *
 * Body: {
 *   call_id,
 *   transcript?: string,      // free-text transcript (or pasted notes)
 *   dream_board_state?: any   // optional tldraw snapshot
 * }
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    call_id?: string;
    transcript?: string;
    dream_board_state?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const call_id = (body.call_id ?? "").trim();
  if (!call_id) {
    return NextResponse.json({ error: "missing_call_id" }, { status: 400 });
  }
  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim() : "";
  const dreamBoard =
    body.dream_board_state ?? null;

  const service = createServiceClient();
  const { data: call } = await service
    .from("calls")
    .select("id, conversation_id, started_at, kind")
    .eq("id", call_id)
    .maybeSingle();
  if (!call) {
    return NextResponse.json({ error: "call_not_found" }, { status: 404 });
  }
  // Verify caller is a participant in the underlying conversation.
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", call.conversation_id)
    .maybeSingle();
  if (
    !conv ||
    (conv.participant_a !== user.id && conv.participant_b !== user.id)
  ) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }

  const endedAt = new Date().toISOString();
  const update: Record<string, any> = { ended_at: endedAt };
  if (transcript) update.transcript = transcript.slice(0, 60000);
  if (dreamBoard !== null) update.dream_board_state = dreamBoard;
  await service.from("calls").update(update).eq("id", call_id);

  // Append the call to BOTH participants' ai_export_blob so their
  // twins use the call context next time they negotiate with anyone.
  // We pull the names so the header reads "# Call with {other} on
  // {date}" from each twin's perspective.
  if (transcript) {
    const ids = [conv.participant_a, conv.participant_b];
    const { data: profs } = await service
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ids);
    const nameById = new Map(
      ((profs ?? []) as any[]).map((p) => [
        p.id,
        p.display_name || p.email || "the other person"
      ])
    );
    const dateLabel = new Date(call.started_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    const kindLabel = call.kind === "audio" ? "Audio call" : "Video call";

    for (const id of ids) {
      const otherId = id === conv.participant_a ? conv.participant_b : conv.participant_a;
      const otherName = nameById.get(otherId) ?? "the other person";
      const block = `\n\n# ${kindLabel} with ${otherName} (${dateLabel})\n${transcript.slice(
        0,
        12000
      )}`;
      try {
        // Read-modify-write — the upsert pattern can't safely append.
        const { data: existing } = await service
          .from("twin_profiles")
          .select("ai_export_blob")
          .eq("user_id", id)
          .maybeSingle();
        const blob =
          ((existing as any)?.ai_export_blob ?? "").toString() + block;
        await service
          .from("twin_profiles")
          .upsert(
            {
              user_id: id,
              ai_export_blob: blob,
              updated_at: new Date().toISOString()
            },
            { onConflict: "user_id" }
          );
      } catch (e) {
        console.warn("[calls/end] append to twin failed for", id, e);
      }
    }
  }

  return NextResponse.json({ ok: true, ended_at: endedAt });
}
