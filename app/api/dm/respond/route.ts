import { NextResponse } from "next/server";
import { contentSafetyResponse } from "@/lib/content-safety";
import { createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { buildDmTwinSystemPrompt } from "@/lib/dm-twin-prompt";
import type { Profile } from "@/lib/types";

/**
 * Append a visitor message to an existing DM thread + generate the
 * twin's reply (#279).
 *
 * POST { thread_id, visitor_token, message, visitor_email? }
 *   → appends visitor msg, generates twin reply, returns both
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_HISTORY = 20;

export async function POST(req: Request) {
  let body: {
    thread_id?: string;
    visitor_token?: string;
    message?: string;
    visitor_email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const threadId = String(body.thread_id ?? "").trim();
  const visitorToken = String(body.visitor_token ?? "").trim();
  const text = (body.message ?? "").trim();
  if (!threadId || !visitorToken || !text) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify ownership via visitor_token.
  const { data: thread } = await service
    .from("dm_threads")
    .select("id, creator_user_id, visitor_token, visitor_email, is_paid, paid_cents")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread || (thread as any).visitor_token !== visitorToken) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const creatorId = (thread as any).creator_user_id as string;
  const safety = await contentSafetyResponse(text);
  if (safety) return safety;

  // Opportunistically capture email if the visitor provided one this turn.
  const newEmail = (body.visitor_email ?? "").trim() || null;
  if (newEmail && !(thread as any).visitor_email) {
    await service
      .from("dm_threads")
      .update({ visitor_email: newEmail })
      .eq("id", threadId);
  }
  const visitorEmail = (thread as any).visitor_email || newEmail || null;

  // Pull creator profile + twin.
  const [{ data: creator }, { data: twin }] = await Promise.all([
    service
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", creatorId)
      .maybeSingle(),
    service
      .from("twin_profiles")
      .select(
        "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city"
      )
      .eq("user_id", creatorId)
      .maybeSingle()
  ]);

  // Load recent history for the prompt.
  const { data: priorRows } = await service
    .from("dm_messages")
    .select("role, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);
  const history = ((priorRows ?? []) as any[])
    .reverse()
    .map((m) => ({
      role:
        m.role === "visitor"
          ? ("user" as const)
          : m.role === "twin"
          ? ("assistant" as const)
          : // creator messages — treat as assistant for prompt purposes
            // since they're from the same "side" as the twin
            ("assistant" as const),
      content: m.body as string
    }));

  // Persist visitor turn BEFORE generating so a crash doesn't lose it.
  await service.from("dm_messages").insert({
    thread_id: threadId,
    role: "visitor",
    body: text
  });

  // Generate twin reply.
  const system = buildDmTwinSystemPrompt({
    creator: creator as Profile,
    creatorTwin: (twin ?? {}) as any,
    availableLinks: [], // TBD: pull from dm_links table
    boostPriceCents: null,
    visitorEmail
  });

  let twinReply = "";
  try {
    const resp = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 600,
      system,
      messages: [...history, { role: "user" as const, content: text }]
    });
    twinReply = resp.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e: any) {
    console.error("[dm/respond] gen failed", e);
    return NextResponse.json(
      { error: "generation_failed", detail: e?.message },
      { status: 500 }
    );
  }

  const { data: asstRow } = await service
    .from("dm_messages")
    .insert({
      thread_id: threadId,
      role: "twin",
      body: twinReply
    })
    .select("id, created_at")
    .single();

  await service
    .from("dm_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);

  return NextResponse.json({
    ok: true,
    twin_reply: {
      id: (asstRow as any)?.id ?? null,
      role: "twin",
      body: twinReply,
      created_at: (asstRow as any)?.created_at ?? null
    }
  });
}
