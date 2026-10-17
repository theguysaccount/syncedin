import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Edit a message in the user's /twin thread (the "dojo" pattern —
 * Jack: "you can edit both sides of the conversation and basically fix
 * either response, and that's data").
 *
 * Every edit captures a delta the future twin can learn from: the user
 * either corrects their own message (sharper wording) or rewrites the
 * twin's reply (refining voice). Both are calibration signals.
 *
 * PATCH /api/twin/chat/edit
 *   { message_id, body }
 *   → updates the message; logs an edit_deltas row if the role is
 *     'assistant' (reusing the existing edit_deltas table that powers
 *     twin-to-twin calibration).
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { message_id?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const messageId = String(body.message_id ?? "").trim();
  const newBody = (body.body ?? "").toString().trim();
  if (!messageId || !newBody) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (newBody.length > 4000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const service = createServiceClient();
  // Verify ownership — this message belongs to the caller's thread.
  const { data: existing } = await service
    .from("twin_chat_messages")
    .select("id, user_id, role, body")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing || (existing as any).user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const originalBody = (existing as any).body as string;
  const role = (existing as any).role as string;
  if (originalBody === newBody) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error } = await service
    .from("twin_chat_messages")
    .update({ body: newBody })
    .eq("id", messageId);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  // Calibration: the updated message body itself becomes future context
  // (next twin reply uses the corrected version), so the edit IS the
  // training signal. The existing edit_deltas table FKs to public.messages
  // (twin-to-twin), not twin_chat_messages, so we can't reuse it here
  // without a schema change. Suppressed for now; if dojo edits become
  // numerous we'll add twin_chat_edit_deltas in a focused migration.
  void role;
  void originalBody;

  return NextResponse.json({ ok: true });
}
