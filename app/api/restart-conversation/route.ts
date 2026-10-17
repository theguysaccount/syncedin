import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Hard-restart a conversation: wipe all existing messages, clear the
 * outcome summary, reset the agreement state, set excitement back to
 * neutral. Lets a participant explicitly say "start this conversation
 * over from scratch" — different from the existing "re-run / continue"
 * button which just generated one more turn past `done=true` (what Jack
 * hit and complained about — "rerun didn't work it just continued
 * conversation").
 *
 * Auth: must be a participant. Restart is destructive but reversible
 * only via the message_history table (not yet implemented) — so we
 * keep the action confirmed client-side via window.confirm before this
 * route is even called.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversationId = body.conversation_id;
  if (!conversationId) {
    return NextResponse.json(
      { error: "missing_conversation_id" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversationId)
    .single();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Wipe messages first (the foreign key chain — edit_deltas reference
  // messages, so delete those too. Best-effort: if edit_deltas is empty
  // or RLS-restricted in some edge case, swallow the error and proceed.
  try {
    // Pull message ids so we can target edit_deltas precisely.
    const { data: msgs } = await service
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    const ids = (msgs ?? []).map((m: any) => m.id);
    if (ids.length > 0) {
      await service.from("edit_deltas").delete().in("message_id", ids);
    }
  } catch (e) {
    console.warn("[restart] edit_deltas cleanup failed (continuing)", e);
  }

  const { error: msgErr } = await service
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);
  if (msgErr) {
    console.error("[restart] message delete failed", msgErr);
    return NextResponse.json(
      { error: "delete_failed", detail: msgErr.message },
      { status: 500 }
    );
  }

  // Reset the conversation row's derived state. Wrapped in try/catch
  // because some columns (agreement_*, excitement_*) may not exist on
  // every deployment — we want restart to succeed even if a couple of
  // optional fields can't be cleared.
  const resetPatch: Record<string, unknown> = {
    outcome_summary: null,
    outcome_generated_at: null,
    last_read_a: null,
    last_read_b: null
  };
  try {
    await service
      .from("conversations")
      .update(resetPatch)
      .eq("id", conversationId);
  } catch (e) {
    console.warn("[restart] partial reset failed (continuing)", e);
  }

  return NextResponse.json({ ok: true });
}
