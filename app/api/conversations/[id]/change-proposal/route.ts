import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Change the proposed agreement inline from /proposals (or anywhere
 * else). Behavior:
 *   1. Look up the most recent message in the conversation that
 *      contains the AGREEMENT marker (the existing proposal).
 *   2. Replace its final_text with the user's new agreement text
 *      (wrapped in the same `>>> AGREEMENT:` marker so the rest of
 *      the system keeps recognising it).
 *   3. Clear any existing agreement_responses — the proposal changed,
 *      so prior accept/reject answers are stale.
 *   4. Update conversations.summary to the new text so the proposals
 *      page renders the change immediately.
 *
 * Jack: "Change proposal needs to happen from the proposal page like
 * other buttons not move to the messages make it more seamless."
 */
const AGREEMENT_MARKER = ">>> AGREEMENT:";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      {
        error: "empty_text",
        detail: "Write the new proposal text before saving."
      },
      { status: 400 }
    );
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "too_long", detail: "Keep it under 4000 characters." },
      { status: 400 }
    );
  }

  const conversationId = params.id;
  const service = createServiceClient();

  // Auth check: caller must be a participant.
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Find the latest message that contains the AGREEMENT marker.
  const { data: messages } = await service
    .from("messages")
    .select("id, final_text, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(50);
  const rows = (messages ?? []) as Array<{
    id: string;
    final_text: string;
    sent_at: string;
  }>;
  const agreementMsg = rows.find((m) =>
    (m.final_text || "").includes(AGREEMENT_MARKER)
  );

  // Wrap the new text in the marker so the rest of the pipeline still
  // detects this as an agreement. Preserve any pre-marker preamble the
  // original message had (e.g. the conversational lead-in the twin
  // wrote before the formal block).
  let newFinalText: string;
  if (agreementMsg) {
    const idx = agreementMsg.final_text.indexOf(AGREEMENT_MARKER);
    const preamble = idx > 0 ? agreementMsg.final_text.slice(0, idx) : "";
    newFinalText = `${preamble}${AGREEMENT_MARKER}\n${text}`;
    const { error: updateErr } = await service
      .from("messages")
      .update({
        final_text: newFinalText,
        // Mark edited so the chat UI shows the (edited) badge. We
        // don't write `edited_at` because that column isn't in the
        // schema (schema.sql tracks edits via a separate edit_deltas
        // table, not a column).
        edited: true
      })
      .eq("id", agreementMsg.id);
    if (updateErr) {
      return NextResponse.json(
        { error: "update_failed", detail: updateErr.message },
        { status: 500 }
      );
    }
  } else {
    // No existing marker — insert a new message from the caller.
    newFinalText = `${AGREEMENT_MARKER}\n${text}`;
    const { error: insertErr } = await service
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_user_id: user.id,
        original_draft: newFinalText,
        final_text: newFinalText,
        edited: false
      });
    if (insertErr) {
      return NextResponse.json(
        { error: "insert_failed", detail: insertErr.message },
        { status: 500 }
      );
    }
  }

  // Clear stale agreement_responses (both sides need to reconsider
  // now that the proposal changed).
  await service
    .from("agreement_responses")
    .delete()
    .eq("conversation_id", conversationId);

  // Update the conversation.summary so /proposals + /messages render
  // the new text immediately without waiting for the next summarize
  // cycle.
  await service
    .from("conversations")
    .update({ summary: text.slice(0, 600) })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, new_text: text });
}
