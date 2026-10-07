import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { contentSafetyResponse } from "@/lib/content-safety";

/**
 * Submit a feedback post. Must be signed in.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { title?: string; body?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = (body.title ?? "").trim().slice(0, 200);
  const text = (body.body ?? "").trim().slice(0, 4000);
  const cat = ["idea", "bug", "feature", "other"].includes(
    String(body.category)
  )
    ? (body.category as string)
    : "idea";
  if (!title) {
    return NextResponse.json({ error: "missing_title" }, { status: 400 });
  }

  const safety = await contentSafetyResponse(`${title}\n${text}`, user.id);
  if (safety) return safety;
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const authorName =
    profile?.display_name || profile?.email?.split("@")[0] || "anon";

  const { data: post, error } = await service
    .from("feedback_posts")
    .insert({
      user_id: user.id,
      author_name: authorName,
      title,
      body: text || null,
      category: cat
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }

  // Auto-upvote your own post.
  await service.from("feedback_votes").insert({
    post_id: post.id,
    user_id: user.id,
    value: 1
  });

  return NextResponse.json({ ok: true, id: post.id });
}

/**
 * Delete your own post.
 */
export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const service = createServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (!post || post.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await service.from("feedback_posts").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
