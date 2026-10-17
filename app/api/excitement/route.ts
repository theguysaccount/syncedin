import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Manually set a conversation's excitement score AND log a calibration delta.
 * The delta is fed back into future scoring so the model learns this user's
 * taste — every override is a training signal.
 */
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

  const conversation_id = (body.conversation_id ?? "").trim();
  const raw = Number(body.score);
  if (!conversation_id || Number.isNaN(raw)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const userScore = Math.max(0, Math.min(100, Math.round(raw)));

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("participant_a, participant_b, excitement_score")
    .eq("id", conversation_id)
    .maybeSingle();
  if (
    !conv ||
    (conv.participant_a !== user.id && conv.participant_b !== user.id)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Log the calibration BEFORE overwriting, so we capture the AI's prior guess.
  const aiScore =
    typeof conv.excitement_score === "number" ? conv.excitement_score : null;
  // Only log if this is meaningfully different (or if AI had no prior score).
  if (aiScore === null || aiScore !== userScore) {
    await service.from("scoring_calibrations").insert({
      user_id: user.id,
      conversation_id,
      ai_score: aiScore,
      user_score: userScore,
      reason: (body.reason ?? "").trim() || null
    });
  }

  const { error } = await service
    .from("conversations")
    .update({ excitement_score: userScore, excitement_locked: true })
    .eq("id", conversation_id);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, score: userScore });
}
