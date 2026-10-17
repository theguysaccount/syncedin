import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Multi-source AI export upload — Jack's "king" twin-context feature.
 * Each user gets one row per source (chatgpt, claude, gemini,
 * perplexity, other) so they can paste deep self-descriptions from
 * EVERY AI tool they use. The twin prompt builder merges all of them
 * with provenance ("from ChatGPT:", "from Claude:") so the twin
 * gets multi-source context without losing track of which tool said
 * what.
 *
 * GET → returns all of the requesting user's exports
 * POST { source, content } → upsert a single source
 * DELETE ?source=<name> → clear a single source
 */

const ALLOWED_SOURCES = new Set([
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "grok",
  "other"
]);

export async function GET() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const { data } = await service
    .from("ai_exports")
    .select("source, content, updated_at")
    .eq("user_id", user.id);
  return NextResponse.json({ exports: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { source?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const source = (body.source ?? "").toLowerCase().trim();
  const content = (body.content ?? "").trim().slice(0, 60_000);
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: "bad_source" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "empty_content" }, { status: 400 });
  }
  const service = createServiceClient();
  const { error } = await service.from("ai_exports").upsert(
    {
      user_id: user.id,
      source,
      content,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,source" }
  );
  if (error) {
    return NextResponse.json(
      { error: "upsert_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, source });
}

export async function DELETE(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const source = (url.searchParams.get("source") ?? "").toLowerCase();
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: "bad_source" }, { status: 400 });
  }
  const service = createServiceClient();
  await service
    .from("ai_exports")
    .delete()
    .eq("user_id", user.id)
    .eq("source", source);
  return NextResponse.json({ ok: true });
}
