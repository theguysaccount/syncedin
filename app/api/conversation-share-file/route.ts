import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Share a file from the user's twin-files library into a conversation.
 * #163 — "File uploads as twin context + twin can share files in
 * conversations (e.g. VC pitch deck)."
 *
 * POST { conversation_id, file_id, note? }
 *   - Verifies caller participates in the conversation
 *   - Verifies file_id belongs to caller (or is a 'shareable' twin-file)
 *   - Creates a conversation_files row (record of the share)
 *   - Posts a message into the chat with a signed download URL embedded
 *     as markdown — the existing ChatUI linkify path renders it.
 *
 * Returns: { ok: true, message_id, signed_url }
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string; file_id?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversationId = String(body.conversation_id ?? "").trim();
  const fileId = String(body.file_id ?? "").trim();
  const note = (body.note ?? "").toString().slice(0, 600).trim();
  if (!conversationId || !fileId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify participation in the conversation.
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversationId)
    .maybeSingle();
  if (
    !conv ||
    ((conv as any).participant_a !== user.id &&
      (conv as any).participant_b !== user.id)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify file ownership.
  const { data: file } = await service
    .from("twin_files")
    .select("id, user_id, name, mime_type, storage_path, kind")
    .eq("id", fileId)
    .maybeSingle();
  if (!file || (file as any).user_id !== user.id) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  // Mint a 7-day signed download URL. Long enough that the counterpart
  // can come back to it from email without re-requesting access; short
  // enough that revoking access via deletion still works fast.
  const { data: signed, error: signErr } = await service.storage
    .from("twin-files")
    .createSignedUrl((file as any).storage_path, 60 * 60 * 24 * 7);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      {
        error: "sign_failed",
        detail: signErr?.message ?? "Couldn't generate a download link."
      },
      { status: 500 }
    );
  }

  // Record the share. Non-fatal if it errors (we still post the message)
  // so a missing FK or migration doesn't block the share UX.
  try {
    await service.from("conversation_files").insert({
      conversation_id: conversationId,
      file_id: fileId,
      shared_by: user.id
    });
  } catch (e) {
    console.warn("[share-file] conv_files insert failed (non-fatal)", e);
  }

  // Compose a chat-message body. ChatUI's linkify renders the URL as a
  // clickable anchor; markdown image syntax already auto-previews for
  // images. For non-image files, we send a plain hyperlink.
  const isImage = /^image\//i.test((file as any).mime_type ?? "");
  const niceName = (file as any).name as string;
  const intro = note ? `${note}\n\n` : `Sharing a file: `;
  const body_text = isImage
    ? `${intro}![${niceName}](${signed.signedUrl})`
    : `${intro}📎 [${niceName}](${signed.signedUrl})`;

  const { data: msg, error: msgErr } = await service
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_user_id: user.id,
      original_draft: body_text,
      final_text: body_text,
      edited: false
    })
    .select("id")
    .single();
  if (msgErr || !msg) {
    return NextResponse.json(
      {
        error: "message_failed",
        detail: msgErr?.message ?? "Couldn't post the message."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message_id: (msg as any).id,
    signed_url: signed.signedUrl
  });
}
