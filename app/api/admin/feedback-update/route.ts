import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Admin feedback update — sets `admin_reply` and/or `status` on a
 * feedback_posts row. Gated to ADMIN_EMAIL so only Jack can move posts
 * through the lifecycle.
 *
 * Body: { post_id, reply?: string, status?: "open"|"in_progress"|"completed" }
 *
 * Why this exists: replaces the "log into Supabase to type a reply"
 * workflow. Now Jack can read the public /feedback page, type a reply
 * inline, mark complete, and the requester sees it on next page load.
 */
const ADMIN_EMAIL = "jacksonjezio@gmail.com";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || (user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { post_id?: string; reply?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const post_id = (body.post_id ?? "").trim();
  if (!post_id) {
    return NextResponse.json({ error: "missing_post_id" }, { status: 400 });
  }
  const status = body.status;
  const reply = typeof body.reply === "string" ? body.reply.trim() : undefined;

  const update: Record<string, any> = {};
  if (status) {
    if (!["open", "in_progress", "completed"].includes(status)) {
      return NextResponse.json({ error: "bad_status" }, { status: 400 });
    }
    update.status = status;
  }
  if (reply !== undefined) {
    update.admin_reply = reply.length > 0 ? reply.slice(0, 4000) : null;
    update.admin_reply_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("feedback_posts")
    .update(update)
    .eq("id", post_id);

  if (error) {
    // Graceful handling when status/admin_reply columns aren't migrated
    // on this DB yet — return the exact SQL the operator needs to run.
    if (/status|admin_reply|schema cache|column/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Your DB needs the new feedback admin columns. Run this SQL in Supabase SQL Editor:\n\nalter table public.feedback_posts add column if not exists status text default 'open' check (status in ('open', 'in_progress', 'completed'));\nalter table public.feedback_posts add column if not exists admin_reply text;\nalter table public.feedback_posts add column if not exists admin_reply_at timestamptz;\ncreate index if not exists feedback_posts_status_idx on public.feedback_posts (status, created_at desc);\n\nThen try again."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
