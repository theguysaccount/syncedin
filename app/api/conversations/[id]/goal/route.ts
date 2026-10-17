import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Per-conversation goal override.
 *
 * GET  → returns { goal_override: string | null }
 * POST → body { goal: string | null }  sets/clears the override
 *
 * Auth: only conversation participants can read or write. RLS on
 * conversations would normally guard this, but we use the service client
 * after an explicit participant check so test personas (no auth row) can
 * still be on the other side.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("participant_a, participant_b, goal_override")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    goal_override: (conv as any).goal_override ?? null
  });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { goal?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const trimmed =
    typeof body.goal === "string" ? body.goal.trim().slice(0, 500) : null;

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("participant_a, participant_b")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await service
    .from("conversations")
    .update({ goal_override: trimmed && trimmed.length > 0 ? trimmed : null })
    .eq("id", params.id);
  if (updateErr) {
    return NextResponse.json(
      { error: "update_failed", detail: updateErr.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, goal_override: trimmed });
}
