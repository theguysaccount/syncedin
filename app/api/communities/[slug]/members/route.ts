import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Owner/admin member management for a room (Jack):
 *   - action "transfer" → make another member the host (owner).
 *   - action "remove"   → kick a member out of the room.
 *
 * Owner-only. The current owner can't be removed (transfer first).
 *
 * POST { action: "transfer" | "remove", userId }
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = String(body.action || "");
  const targetId = String(body.userId || "").trim();
  if (!targetId || (action !== "transfer" && action !== "remove")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const slug = (params.slug || "").toLowerCase();
  const service = createServiceClient();
  const { data: conf } = await service
    .from("conferences")
    .select("slug, owner_user_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!conf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if ((conf as any).owner_user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: "cannot_target_self" }, { status: 400 });
  }

  if (action === "transfer") {
    // Target must be a member. Make them a member if somehow not, then
    // hand over ownership. The old owner remains a member.
    await service
      .from("conference_members")
      .upsert(
        { conference_slug: slug, user_id: targetId },
        { onConflict: "conference_slug,user_id" }
      );
    const { error } = await service
      .from("conferences")
      .update({ owner_user_id: targetId })
      .eq("slug", slug);
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, action: "transferred" });
  }

  // remove
  const { error } = await service
    .from("conference_members")
    .delete()
    .eq("conference_slug", slug)
    .eq("user_id", targetId);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, action: "removed" });
}
