import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { contentSafetyResponse } from "@/lib/content-safety";

/**
 * Override a poll response. Only the twin's owner can update their own row.
 *
 * Body: { response_id: string, text: string }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { response_id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const responseId = (body.response_id ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!responseId || text.length < 3) {
    return NextResponse.json({ error: "invalid_args" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify the response belongs to this user's twin AND this poll.
  const { data: row } = await service
    .from("poll_responses")
    .select("id, poll_id, twin_user_id, was_overridden")
    .eq("id", responseId)
    .maybeSingle();
  if (!row || row.poll_id !== params.id || row.twin_user_id !== user.id) {
    return NextResponse.json({ error: "not_authorized_for_row" }, { status: 403 });
  }

  const wasOverride = (row as any).was_overridden as boolean;
  const safety = await contentSafetyResponse(text, user.id);
  if (safety) return safety;

  // Update the row.
  const { error: updErr } = await service
    .from("poll_responses")
    .update({
      human_override: text,
      was_overridden: true,
      overridden_at: new Date().toISOString()
    })
    .eq("id", responseId);
  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", detail: updErr.message },
      { status: 500 }
    );
  }

  // Bump overrides_count on the parent poll (only on first override).
  if (!wasOverride) {
    const { data: poll } = await service
      .from("polls")
      .select("overrides_count")
      .eq("id", params.id)
      .single();
    await service
      .from("polls")
      .update({ overrides_count: (poll?.overrides_count ?? 0) + 1 })
      .eq("id", params.id);
  }

  return NextResponse.json({ ok: true });
}
