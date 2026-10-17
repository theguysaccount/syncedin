import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Publish a completed win-win as a public receipt (proof-of-outcome).
 *
 * Strict honesty rules:
 *  - Caller must be authenticated AND a participant of the conversation.
 *  - The conversation must have a non-empty outcome (summary). The UI
 *    additionally only offers the button on ACCEPTED outcomes.
 *  - One receipt per conversation (upsert), so republishing edits
 *    rather than duplicating.
 *  - anonymize=true publishes "A SyncedIn member" labels instead of
 *    display names. The other participant's name is NEVER published
 *    without anonymize=false being an explicit choice by a participant.
 *
 * POST { conversationId, anonymize?: boolean } → { ok, id }
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

  let body: { conversationId?: string; anonymize?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversationId = (body.conversationId ?? "").toString().trim();
  const anonymize = body.anonymize !== false; // default TRUE: privacy first
  if (!conversationId) {
    return NextResponse.json({ error: "missing_conversation" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, summary")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const outcome = (conv.summary ?? "").toString().trim();
  if (!outcome) {
    return NextResponse.json(
      { error: "no_outcome", detail: "This conversation has no outcome to publish yet." },
      { status: 400 }
    );
  }

  // Receipts are proof: require BOTH participants to have accepted.
  const { data: resps } = await service
    .from("agreement_responses")
    .select("user_id, response")
    .eq("conversation_id", conversationId);
  const acceptedIds = new Set(
    (resps ?? [])
      .filter((r: { response: string }) => r.response === "accepted")
      .map((r: { user_id: string }) => r.user_id)
  );
  if (
    !acceptedIds.has(conv.participant_a) ||
    !acceptedIds.has(conv.participant_b)
  ) {
    return NextResponse.json(
      {
        error: "not_sealed",
        detail: "Both sides need to accept before a win can be published."
      },
      { status: 400 }
    );
  }

  let partyA = "A SyncedIn member";
  let partyB = "A SyncedIn member";
  if (!anonymize) {
    const { data: profs } = await service
      .from("profiles")
      .select("id, display_name")
      .in("id", [conv.participant_a, conv.participant_b]);
    const byId = new Map(
      (profs ?? []).map((p: { id: string; display_name: string | null }) => [
        p.id,
        (p.display_name ?? "").trim()
      ])
    );
    partyA = byId.get(conv.participant_a) || "A SyncedIn member";
    partyB = byId.get(conv.participant_b) || "A SyncedIn member";
  }

  const { data: row, error } = await service
    .from("win_receipts")
    .upsert(
      {
        conversation_id: conversationId,
        published_by: user.id,
        outcome_text: outcome.slice(0, 1200),
        party_a: partyA,
        party_b: partyB,
        anonymized: anonymize
      },
      { onConflict: "conversation_id" }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    // Most likely: 0003 migration not run yet. Honest signal back.
    return NextResponse.json(
      {
        error: "receipts_unavailable",
        detail: "Receipts storage isn't live yet. Run migration 0003 and retry."
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, id: row?.id ?? null });
}
