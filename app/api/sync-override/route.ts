import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Per-conversation sync-score override (#278). Mirrors /api/excitement
 * but writes to conversations.sync_score_override + the reason +
 * timestamp. Used by the dashboard SyncControl pill.
 *
 * Different from /api/scoring-prompt: that edits the GLOBAL rubric
 * future scores use. This is a single-pair manual correction.
 *
 * POST { conversation_id, score (0-100), reason? }
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

  let body: { conversation_id?: string; score?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversationId = String(body.conversation_id ?? "").trim();
  const raw = Number(body.score);
  if (!conversationId || Number.isNaN(raw)) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const reason = (body.reason ?? "").toString().slice(0, 400).trim() || null;

  const service = createServiceClient();
  // Verify the caller participates in the conversation.
  const { data: conv } = await service
    .from("conversations")
    .select("participant_a, participant_b")
    .eq("id", conversationId)
    .maybeSingle();
  if (
    !conv ||
    ((conv as any).participant_a !== user.id &&
      (conv as any).participant_b !== user.id)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await service
    .from("conversations")
    .update({
      sync_score_override: score,
      sync_score_override_reason: reason,
      sync_score_override_at: new Date().toISOString()
    })
    .eq("id", conversationId);
  if (error) {
    if (/column .* does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Run the sync_score_override migration in Supabase → SQL Editor."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, score });
}
