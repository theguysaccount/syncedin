import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyChange, editMagnitude } from "@/lib/edit-magnitude";
import { CONNECTION_NOTE_LIMIT, parseOutreachContext } from "@/lib/outreach-context";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const context = parseOutreachContext(body);
  const editedText = typeof body.edited_text === "string" ? body.edited_text.trim() : "";
  const originalDraft = typeof body.original_draft === "string" ? body.original_draft.trim() : "";
  if (!context.person_title || !context.person_url || !editedText) {
    return NextResponse.json({ error: "A recipient and connection note are required." }, { status: 400 });
  }
  if (editedText.length > CONNECTION_NOTE_LIMIT || originalDraft.length > CONNECTION_NOTE_LIMIT) {
    return NextResponse.json({ error: "Connection notes must be 300 characters or fewer." }, { status: 400 });
  }

  // Repeated saves replace this context's example; a different purpose gets its own.
  const contextKey = createHash("sha256").update(JSON.stringify([
    context.person_url, context.search_query, context.connection_reason
  ])).digest("hex");
  const { error } = await supabase.from("outreach_examples").upsert({
    user_id: user.id,
    context_key: contextKey,
    ...context,
    original_draft: originalDraft,
    edited_text: editedText,
    edit_magnitude: originalDraft ? editMagnitude(originalDraft, editedText) : null,
    change_tags: originalDraft ? classifyChange(originalDraft, editedText) : [],
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,context_key" });

  if (error) {
    console.error("outreach feedback save failed", error);
    if (error.code === "PGRST205" || error.code === "42P01") {
      return NextResponse.json({ error: "Twin memory is not available yet. Your note has not been learned; you can still edit and copy it." }, { status: 503 });
    }
    return NextResponse.json({ error: "Your twin could not save this note. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
