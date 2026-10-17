import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import {
  buildTwinSystemPrompt,
  buildConversationHistory,
  scrubAiTells
} from "@/lib/twin-prompt";
import type { Profile, TwinProfile, Message, EditDelta } from "@/lib/types";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    conversation_id?: string;
    previous_draft?: string;
    your_edit?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { conversation_id, previous_draft, your_edit } = body;
  if (!conversation_id || !previous_draft || !your_edit) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("*")
    .eq("id", conversation_id)
    .single();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const otherId =
    conv.participant_a === user.id ? conv.participant_b : conv.participant_a;

  const [
    { data: selfProfile },
    { data: selfTwin },
    { data: otherProfile },
    { data: otherTwin },
    { data: messages },
    { data: deltas }
  ] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id).single(),
    service
      .from("twin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    service.from("profiles").select("*").eq("id", otherId).single(),
    service
      .from("twin_profiles")
      .select("goals, deal_preferences")
      .eq("user_id", otherId)
      .maybeSingle(),
    service
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation_id)
      .order("sent_at", { ascending: true }),
    service
      .from("edit_deltas")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  if (!selfTwin) {
    return NextResponse.json({ error: "twin_not_set_up" }, { status: 400 });
  }

  let systemPrompt = buildTwinSystemPrompt({
    self: selfProfile as Profile,
    selfTwin: selfTwin as TwinProfile,
    counterpart: otherProfile as Profile,
    counterpartTwin:
      (otherTwin as Pick<TwinProfile, "goals" | "deal_preferences">) ?? null,
    recentDeltas: (deltas as EditDelta[]) ?? [],
    goalOverride: (conv as any)?.goal_override ?? null
  });

  systemPrompt += `\n\n# IMPORTANT — live correction from your principal
Your most recent draft was:
"""
${previous_draft}
"""

Your principal edited it to:
"""
${your_edit}
"""

Use this correction as your strongest signal about how to write the next attempt. Regenerate the same message — same intent, same conversation position — but reflecting the voice, framing, and judgment your principal demonstrated in their edit. Do not simply parrot their edit; produce a better-calibrated draft that incorporates the lesson.`;

  const history = buildConversationHistory(
    (messages as Message[]) ?? [],
    user.id
  );
  if (history.length === 0) {
    history.push({
      role: "user",
      content: "(No prior messages. Open the conversation with a substantive first message.)"
    });
  }

  try {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: history
    });
    const text = scrubAiTells(
      response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim()
    );
    return NextResponse.json({ draft: text });
  } catch (e: any) {
    console.error("anthropic regenerate error", e);
    return NextResponse.json(
      { error: "regenerate_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
