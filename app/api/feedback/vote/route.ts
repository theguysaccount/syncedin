import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Toggle vote on a feedback post.
 *
 * Behavior:
 *   - Click +1 with no existing vote → create +1 vote
 *   - Click +1 with existing +1 → remove vote (undo)
 *   - Click +1 with existing -1 → flip to +1
 *   - Same logic for -1
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { post_id?: string; value?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const post_id = (body.post_id ?? "").trim();
  const value = body.value === -1 ? -1 : 1;
  if (!post_id) {
    return NextResponse.json({ error: "missing_post_id" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: existing } = await service
    .from("feedback_votes")
    .select("value")
    .eq("post_id", post_id)
    .eq("user_id", user.id)
    .maybeSingle();

  let newState: "up" | "down" | null = null;
  if (!existing) {
    await service.from("feedback_votes").insert({
      post_id,
      user_id: user.id,
      value
    });
    newState = value === 1 ? "up" : "down";
  } else if (existing.value === value) {
    // Same vote = undo
    await service
      .from("feedback_votes")
      .delete()
      .eq("post_id", post_id)
      .eq("user_id", user.id);
    newState = null;
  } else {
    // Different vote = flip
    await service
      .from("feedback_votes")
      .update({ value })
      .eq("post_id", post_id)
      .eq("user_id", user.id);
    newState = value === 1 ? "up" : "down";
  }

  return NextResponse.json({ ok: true, state: newState });
}
