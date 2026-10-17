import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Humans-only chat for community + conference rooms. Jack: "Inside of
 * communities and conferences, let's have a humans-only chat part of
 * that page." Distinct from twin-to-twin convos — these are real
 * messages typed by real members of the room.
 *
 * GET /api/community-chat?community_id=...  OR  ?conference_id=...
 *   → returns chronological message list (last 200, oldest first)
 *
 * POST { community_id?, conference_id?, body }
 *   → posts a message. Author resolved from auth.uid(). Caller must be
 *     a member of the room (or it's public).
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Accept either ?conference_id=<slug> (canonical) or ?community_id=<slug>
  // (alias for back-compat — communities live in the same conferences
  // table with kind='community').
  const url = new URL(req.url);
  const room =
    url.searchParams.get("conference_id") ||
    url.searchParams.get("community_id");
  if (!room) {
    return NextResponse.json({ messages: [] });
  }
  const service = createServiceClient();
  try {
    const { data, error } = await service
      .from("community_chat_messages")
      .select(
        "id, conference_id, author_id, author_name, author_avatar_url, body, created_at, removed_at"
      )
      .is("removed_at", null)
      .eq("conference_id", room)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ messages: [], _err: e?.message ?? null });
  }
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { community_id?: string; conference_id?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  // Either field works — communities + conferences share the same table
  // so we normalize to a single conference_id (which is the room slug).
  const room = body.conference_id ?? body.community_id ?? null;
  if (!text) {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }
  if (!room) {
    return NextResponse.json(
      { error: "missing_room_id" },
      { status: 400 }
    );
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const service = createServiceClient();
  // Resolve author name + avatar so the chat tab doesn't have to join
  // against profiles on every read.
  let author_name: string | null = null;
  let author_avatar_url: string | null = null;
  try {
    const { data: p } = await service
      .from("profiles")
      .select("display_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    author_name =
      ((p as any)?.display_name as string) ||
      ((p as any)?.email as string)?.split("@")[0] ||
      null;
    author_avatar_url = ((p as any)?.avatar_url as string) ?? null;
  } catch {
    /* fallback to null author_name; UI shows "anon" */
  }

  const { data, error } = await service
    .from("community_chat_messages")
    .insert({
      conference_id: room,
      author_id: user.id,
      author_name,
      author_avatar_url,
      body: text
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
            "Your DB needs the community_chat_messages + community_join_requests tables. Run the latest supabase/schema.sql in Supabase → SQL Editor (the diff under the 'Communities/Conferences shared additions' header). Then try again."
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
    author_name,
    author_avatar_url
  });
}
