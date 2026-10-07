import { NextResponse } from "next/server";
import { contentSafetyResponse } from "@/lib/content-safety";
import { createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { buildDmTwinSystemPrompt } from "@/lib/dm-twin-prompt";
import type { Profile } from "@/lib/types";

/**
 * Start a new DM thread with a creator's twin (#279, Link.me partnership).
 *
 * POST { creator_handle, message, visitor_name?, visitor_email? }
 *   → creates dm_threads row + 2 dm_messages (visitor's first msg + twin reply)
 *   → returns { thread_id, visitor_token, messages }
 *
 * Visitor proves ownership on subsequent calls via the returned
 * visitor_token. No Supabase auth — fully public surface.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function randomToken(): string {
  // 32 chars base36 — collision-safe for a uuid-indexed column
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

export async function POST(req: Request) {
  let body: {
    creator_handle?: string;
    message?: string;
    visitor_name?: string;
    visitor_email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const handle = (body.creator_handle ?? "").toLowerCase().trim();
  const firstMessage = (body.message ?? "").trim();
  if (!handle || !firstMessage) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (firstMessage.length > 4000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const service = createServiceClient();
  const safety = await contentSafetyResponse(firstMessage);
  if (safety) return safety;

  // Resolve creator by handle.
  const { data: creator } = await service
    .from("profiles")
    .select("id, display_name, email")
    .ilike("handle", handle)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json({ error: "creator_not_found" }, { status: 404 });
  }
  const creatorId = (creator as any).id as string;

  // Pull twin profile for the system prompt.
  const { data: twin } = await service
    .from("twin_profiles")
    .select(
      "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city"
    )
    .eq("user_id", creatorId)
    .maybeSingle();
  if (!twin) {
    return NextResponse.json(
      {
        error: "creator_not_ready",
        detail: "This creator hasn't built their twin yet."
      },
      { status: 400 }
    );
  }

  // Create the thread.
  const visitor_token = randomToken();
  const visitor_email = (body.visitor_email ?? "").trim() || null;
  const visitor_name = (body.visitor_name ?? "").trim() || null;

  const { data: thread, error: threadErr } = await service
    .from("dm_threads")
    .insert({
      creator_user_id: creatorId,
      visitor_token,
      visitor_email,
      visitor_name
    })
    .select("id")
    .single();
  if (threadErr || !thread) {
    if (/relation .* does not exist|schema cache/i.test(threadErr?.message ?? "")) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Run the dm_threads + dm_messages migration in Supabase → SQL Editor."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "thread_create_failed", detail: threadErr?.message },
      { status: 500 }
    );
  }
  const threadId = (thread as any).id as string;

  // Persist the visitor's opening message.
  await service.from("dm_messages").insert({
    thread_id: threadId,
    role: "visitor",
    body: firstMessage
  });

  // Generate the twin's reply.
  const system = buildDmTwinSystemPrompt({
    creator: creator as Profile,
    creatorTwin: (twin ?? {}) as any,
    // TBD: pull from creator's saved dm_links table once that ships. For
    // now empty — twin will degrade to "no specific links available".
    availableLinks: [],
    boostPriceCents: null, // TBD: pull from creator settings; null = boost disabled
    visitorEmail: visitor_email
  });

  let twinReply = "";
  try {
    const resp = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: firstMessage }]
    });
    twinReply = resp.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e: any) {
    console.error("[dm/start] gen failed", e);
    twinReply = "Sorry — couldn't reach the model right now. Try again in a moment.";
  }

  await service.from("dm_messages").insert({
    thread_id: threadId,
    role: "twin",
    body: twinReply
  });

  await service
    .from("dm_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);

  return NextResponse.json({
    ok: true,
    thread_id: threadId,
    visitor_token,
    messages: [
      { role: "visitor", body: firstMessage },
      { role: "twin", body: twinReply }
    ]
  });
}
