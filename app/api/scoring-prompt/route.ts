import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_SCORING_PROMPT } from "@/lib/scoring";

/**
 * GET  /api/scoring-prompt
 *   → returns { prompt, is_default, calibrations: [{ai_score, user_score, ...}] }
 *
 * PUT  /api/scoring-prompt   { prompt }
 *   → upserts the user's prompt
 *
 * The calibrations list is the trail of times the user manually overrode the
 * AI's excitement score. It's surfaced to Claude when scoring new
 * conversations, so the score "learns" each time the user adjusts it.
 */
export async function GET() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const [{ data: row }, { data: cals }] = await Promise.all([
    service
      .from("scoring_prompts")
      .select("prompt")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("scoring_calibrations")
      .select("ai_score, user_score, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);
  return NextResponse.json({
    prompt: row?.prompt ?? DEFAULT_SCORING_PROMPT,
    is_default: !row,
    default_prompt: DEFAULT_SCORING_PROMPT,
    calibrations: cals ?? []
  });
}

export async function PUT(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
  }
  const service = createServiceClient();
  const { error } = await service
    .from("scoring_prompts")
    .upsert(
      { user_id: user.id, prompt, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
