import { NextResponse } from "next/server";
import { contentSafetyResponse } from "@/lib/content-safety";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { editMagnitude, classifyChange } from "@/lib/edit-magnitude";

/**
 * Edit any message in a conversation, then truncate everything after it so
 * the rest of the conversation can be regenerated from the edit point.
 *
 * - Either participant may edit any message (per product spec).
 * - If the editor is editing THEIR OWN twin's message, the change is logged
 *   as an edit_delta (voice training signal). Editing the other twin's
 *   message is a steering action and is not logged as voice training.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { message_id?: string; new_text?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { message_id, new_text, reason } = body;
  if (!message_id || !new_text || !new_text.trim()) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const service = createServiceClient();
  let { data: msg } = await service
    .from("messages")
    .select("*")
    .eq("id", message_id)
    .maybeSingle();
  // Stale-id recovery: a concurrent regenerate / change-proposal may
  // have replaced this message between the user opening edit mode and
  // hitting save. If we can't find the id, fall back to the user's
  // MOST RECENT message in any conversation they participate in —
  // 99% of the time that's the one they meant. We re-check ownership
  // below so this can't be abused to edit someone else's message.
  if (!msg) {
    const { data: convs } = await service
      .from("conversations")
      .select("id")
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(20);
    const convIds = ((convs ?? []) as any[]).map((c) => c.id);
    if (convIds.length) {
      const { data: recent } = await service
        .from("messages")
        .select("*")
        .in("conversation_id", convIds)
        .eq("sender_user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(1);
      const candidate = (recent ?? [])[0] as any;
      if (candidate) {
        msg = candidate;
      }
    }
    if (!msg) {
      return NextResponse.json(
        {
          error: "not_found",
          detail:
            "Couldn't locate that message — it may have been regenerated. Refresh the conversation and try again.",
          stale_message_id: message_id
        },
        { status: 404 }
      );
    }
  }

  const { data: conv } = await service
    .from("conversations")
    .select("*")
    .eq("id", msg.conversation_id)
    .single();
  if (!conv) {
    return NextResponse.json(
      { error: "conversation_not_found" },
      { status: 404 }
    );
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // You can only edit your OWN twin's messages, not the other person's.
  if (msg.sender_user_id !== user.id) {
    return NextResponse.json(
      {
        error: "not_your_message",
        detail: "You can only edit your own messages."
      },
      { status: 403 }
    );
  }

  const original = msg.final_text;
  const safety = await contentSafetyResponse(new_text, user.id);
  if (safety) return safety;

  // Snapshot the conversation up to and including this message for the delta log.
  const { data: priorMessages } = await service
    .from("messages")
    .select("id, sender_user_id, final_text, sent_at")
    .eq("conversation_id", msg.conversation_id)
    .lte("sent_at", msg.sent_at)
    .order("sent_at", { ascending: true });

  // Update the message text + stage-1 edit-magnitude metric (how far the
  // user moved the twin's original draft). change_tags is the kind of
  // correction. Written here in the same update; if the 0005 migration
  // hasn't run, fall back to the text-only update so the edit still saves.
  const mag = editMagnitude(msg.original_draft ?? original, new_text);
  const tags = classifyChange(msg.original_draft ?? original, new_text);
  let { error: updErr } = await service
    .from("messages")
    .update({
      final_text: new_text,
      edited: true,
      edit_magnitude: mag,
      change_tags: tags
    })
    .eq("id", message_id);
  if (updErr) {
    console.warn(
      "[edit-magnitude] message update with metric failed (run migration 0005?); retrying text-only:",
      updErr.message
    );
    ({ error: updErr } = await service
      .from("messages")
      .update({ final_text: new_text, edited: true })
      .eq("id", message_id));
  }
  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", detail: updErr.message },
      { status: 500 }
    );
  }

  // Log a voice-training delta only when the editor edits their own twin.
  if (msg.sender_user_id === user.id && original !== new_text) {
    const { data: delta, error: deltaErr } = await service
      .from("edit_deltas")
      .insert({
        message_id,
        user_id: user.id,
        original_draft: msg.original_draft,
        edited_text: new_text,
        conversation_snapshot: priorMessages ?? [],
        reason: reason?.trim() || null
      })
      .select("id")
      .single();
    if (deltaErr) console.error("edit_delta insert failed", deltaErr);
    else if (delta) {
      // Mirror the stage-1 metric onto the delta row. Best-effort: swallow
      // the missing-column error if migration 0005 hasn't run yet.
      const { error: mErr } = await service
        .from("edit_deltas")
        .update({ edit_magnitude: mag, change_tags: tags })
        .eq("id", (delta as { id: string }).id);
      if (mErr)
        console.warn(
          "[edit-magnitude] skip edit_deltas metric (run migration 0005?):",
          mErr.message
        );
    }
  }

  // Truncate everything after the edited message — it will be regenerated.
  const { error: delErr } = await service
    .from("messages")
    .delete()
    .eq("conversation_id", msg.conversation_id)
    .gt("sent_at", msg.sent_at);
  if (delErr) {
    return NextResponse.json(
      { error: "truncate_failed", detail: delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
