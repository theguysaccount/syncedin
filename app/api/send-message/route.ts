import { NextResponse } from "next/server";
import { contentSafetyResponse } from "@/lib/content-safety";
import { connectionBlocked } from "@/lib/user-safety";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyNewMessage } from "@/lib/notify";
import { editMagnitude, classifyChange } from "@/lib/edit-magnitude";

/**
 * Best-effort write of the stage-1 edit-magnitude metric onto a row. Runs as
 * a separate UPDATE (not in the insert) so that if the 0005 migration hasn't
 * been applied yet, a missing-column error is logged and swallowed instead of
 * failing the send. Remove the guard once 0005 is live everywhere.
 */
async function logEditMetric(
  service: ReturnType<typeof createServiceClient>,
  table: "messages" | "edit_deltas",
  id: string,
  draft: string,
  finalText: string
) {
  const { error } = await service
    .from(table)
    .update({
      edit_magnitude: editMagnitude(draft, finalText),
      change_tags: classifyChange(draft, finalText)
    })
    .eq("id", id);
  if (error) {
    console.warn(
      `[edit-magnitude] skip ${table} ${id} (run migration 0005?):`,
      error.message
    );
  }
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    conversation_id?: string;
    original_draft?: string;
    final_text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { conversation_id, original_draft, final_text } = body;
  if (!conversation_id || !original_draft || !final_text) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!final_text.trim()) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("*")
    .eq("id", conversation_id)
    .single();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const edited = original_draft !== final_text;
  const other = conv.participant_a === user.id ? conv.participant_b : conv.participant_a;
  if (await connectionBlocked(user.id, other)) return NextResponse.json({ error: "This connection is blocked." }, { status: 403 });
  const safety = await contentSafetyResponse(final_text, user.id);
  if (safety) return safety;

  // Snapshot conversation state at the time of edit (for delta log).
  const { data: priorMessages } = await service
    .from("messages")
    .select("id, sender_user_id, final_text, sent_at")
    .eq("conversation_id", conversation_id)
    .order("sent_at", { ascending: true });

  const { data: message, error } = await service
    .from("messages")
    .insert({
      conversation_id,
      sender_user_id: user.id,
      original_draft,
      final_text,
      edited
    })
    .select("*")
    .single();

  if (error || !message) {
    console.error("message insert failed", error);
    return NextResponse.json(
      { error: "insert_failed", detail: error?.message },
      { status: 500 }
    );
  }

  // Stage-1 metric: log how far the user moved the twin's draft (0 = sent
  // as-is/win .. 1 = rewritten) + the kind of correction. Best-effort.
  await logEditMetric(service, "messages", message.id, original_draft, final_text);

  // Log the delta — this is the proprietary training corpus for the user's twin.
  if (edited) {
    const { data: delta, error: deltaErr } = await service
      .from("edit_deltas")
      .insert({
        message_id: message.id,
        user_id: user.id,
        original_draft,
        edited_text: final_text,
        conversation_snapshot: priorMessages ?? []
      })
      .select("id")
      .single();
    if (deltaErr) console.error("delta insert failed", deltaErr);
    else if (delta)
      await logEditMetric(
        service,
        "edit_deltas",
        (delta as { id: string }).id,
        original_draft,
        final_text
      );
  }

  // Fire-and-forget notification to the counterpart.
  notifyNewMessage({
    conversationId: conversation_id,
    messageId: message.id,
    senderUserId: user.id
  }).catch((e) => console.warn("[send-message] notify failed", e));

  return NextResponse.json({ message });
}
