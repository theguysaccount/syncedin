import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Save a chat-export + projected continuation as twin context (#166 +
 * Jack's "this is also a context import mechanism" insight).
 *
 * The conversations a user has had with people are some of the richest
 * twin-training data possible — they reveal voice, deal-making style,
 * who they actually engage with, what they decline. Letting users save
 * these into their twin's ai_export_blob with a clear provenance marker
 * makes every chat-continuation flow do double duty: produce a
 * shareable projection AND deepen the twin.
 *
 * POST { transcript_text, other_name? }
 *   → appends a labeled block to twin_profiles.ai_export_blob
 */
export const dynamic = "force-dynamic";

const MAX_BLOCK_CHARS = 30_000;

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { transcript_text?: string; other_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const transcript = (body.transcript_text ?? "").trim();
  if (transcript.length < 40) {
    return NextResponse.json(
      { error: "transcript_too_short" },
      { status: 400 }
    );
  }
  const otherName = (body.other_name ?? "").toString().trim() || "someone";

  // Cap how much we append — long chat dumps would balloon the blob and
  // hit token budgets in the twin prompt.
  const slice = transcript.slice(0, MAX_BLOCK_CHARS);
  const dateStr = new Date().toISOString().slice(0, 10);
  const header = `\n\n# Chat with ${otherName} (imported ${dateStr})\nReal back-and-forth captured from my prior chat with ${otherName}. Voice, references, and decisions in this thread are mine — pull from it when representing me in similar conversations.\n\n`;
  const block = header + slice;

  const service = createServiceClient();
  const { data: row } = await service
    .from("twin_profiles")
    .select("ai_export_blob")
    .eq("user_id", user.id)
    .maybeSingle();
  const existing = ((row as any)?.ai_export_blob ?? "").toString();
  const next = (existing + block).slice(-180_000); // hard ceiling on total blob size

  const { error: upErr } = await service
    .from("twin_profiles")
    .upsert(
      { user_id: user.id, ai_export_blob: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (upErr) {
    return NextResponse.json(
      { error: "save_failed", detail: upErr.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, appended_chars: block.length });
}
