import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { contentSafetyResponse } from "@/lib/content-safety";

/**
 * Comments on a feedback request. GET ?post_id=... returns the list,
 * POST creates a new one.
 *
 * Jack: "lets also add the ability for replies on these from general
 * people."
 *
 * Storage: feedback_comments table (created on first POST via inline
 * migration check). Each row records user_id + author_name + body +
 * is_admin (computed at write time based on ADMIN_EMAIL match).
 */
const ADMIN_EMAIL = "jacksonjezio@gmail.com";

async function ensureTable() {
  // We can't run DDL from a serverless function reliably. Instead the
  // initial select will fail with schema_missing and we return a clear
  // SQL snippet for Jack to run once. After that, it's a no-op.
  return;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const post_id = url.searchParams.get("post_id") || "";
  if (!post_id) {
    return NextResponse.json({ comments: [] });
  }
  await ensureTable();
  const service = createServiceClient();
  try {
    const { data, error } = await service
      .from("feedback_comments")
      .select(
        "id, user_id, author_name, body, created_at, is_admin"
      )
      .eq("post_id", post_id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ comments: data ?? [] });
  } catch (e: any) {
    // Schema missing or other error — return empty list so the UI
    // degrades gracefully rather than 500ing the whole feedback page.
    return NextResponse.json({ comments: [], _err: e?.message ?? null });
  }
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { post_id?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const post_id = (body.post_id ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!post_id || !text) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const safety = await contentSafetyResponse(text, user.id);
  if (safety) return safety;

  const service = createServiceClient();

  // Resolve author display name once at write time so the GET response
  // doesn't have to join profiles on every read.
  let author_name: string | null = null;
  try {
    const { data: p } = await service
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle();
    author_name =
      ((p as any)?.display_name as string) ||
      ((p as any)?.email as string)?.split("@")[0] ||
      null;
  } catch {
    /* fall back to anon */
  }

  const is_admin =
    (user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const { data, error } = await service
    .from("feedback_comments")
    .insert({
      post_id,
      user_id: user.id,
      author_name,
      body: text,
      is_admin
    })
    .select("id")
    .single();

  if (error) {
    if (
      /relation .* does not exist|schema cache|column .* does not exist/i.test(
        error.message
      )
    ) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Your DB needs the feedback_comments table. Run this SQL once in Supabase → SQL Editor:\n\ncreate table if not exists public.feedback_comments (\n  id uuid primary key default gen_random_uuid(),\n  post_id uuid not null references public.feedback_posts(id) on delete cascade,\n  user_id uuid references auth.users(id) on delete set null,\n  author_name text,\n  body text not null,\n  is_admin boolean not null default false,\n  created_at timestamptz not null default now()\n);\ncreate index if not exists feedback_comments_post_idx on public.feedback_comments (post_id, created_at);\nalter table public.feedback_comments enable row level security;\ncreate policy \"feedback_comments_read_all\" on public.feedback_comments for select using (true);\ncreate policy \"feedback_comments_insert_authed\" on public.feedback_comments for insert with check (auth.uid() is not null);\n\nThen try again."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: (data as any)?.id ?? null,
    author_name
  });
}
