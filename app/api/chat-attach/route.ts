import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Chat-message attachment upload. Distinct from /api/twin-files (which
 * stores files used as twin CONTEXT). This route stores files the user
 * is including in a HUMAN-typed message — images, videos, pdf decks
 * they want to share inline.
 *
 * Jack: "add the ability in the chat for someone to send a video or
 * a file when they have the custom bar there to do so."
 *
 * POST multipart/form-data:
 *   file: File         (required)
 *   conversation_id    (required — keys the storage path so each
 *                       conversation's attachments are contained)
 *
 * Returns { url, mime_type, name, size_bytes }. Caller embeds the URL
 * inline in the message text as markdown:
 *   ![filename](url)       — for images/gifs (rendered as <img>)
 *   📎 [filename](url)     — for non-image files (rendered as link)
 *
 * Storage bucket: "chat-attachments" (must exist + be configured
 * public-read). If missing, returns schema_missing with the exact
 * SQL/admin-action needed.
 */
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard cap
const BUCKET = "chat-attachments";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  const conversation_id = String(form.get("conversation_id") ?? "").trim();
  if (!(file instanceof File) || !conversation_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", detail: `max ${MAX_BYTES} bytes` },
      { status: 400 }
    );
  }

  // Authorize: viewer must be a participant of the conversation.
  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversation_id)
    .maybeSingle();
  if (
    !conv ||
    (conv.participant_a !== user.id && conv.participant_b !== user.id)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Sanitize filename for storage path. Keep extension for content-type
  // hinting; strip everything except [a-z0-9._-].
  const safeName = (file.name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(-80);
  const storagePath = `${conversation_id}/${user.id}/${Date.now()}-${safeName}`;

  // Upload. createServiceClient bypasses RLS; we already authorized
  // above so this is safe.
  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await service.storage
    .from(BUCKET)
    .upload(storagePath, new Uint8Array(arrayBuf), {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
  if (upErr) {
    if (
      /bucket.*not.*found|does not exist/i.test(upErr.message || "") ||
      (upErr as any).statusCode === "404"
    ) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Storage bucket 'chat-attachments' doesn't exist. Create it in Supabase → Storage:\n  1. New bucket → name: 'chat-attachments' → Public: ON\n  2. Set max file size to 25 MB\n  3. Try the upload again."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "upload_failed", detail: upErr.message },
      { status: 500 }
    );
  }

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(storagePath);
  const url = pub?.publicUrl ?? "";

  return NextResponse.json({
    url,
    mime_type: file.type || "application/octet-stream",
    name: file.name || safeName,
    size_bytes: file.size
  });
}
