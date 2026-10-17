import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import {
  buildTwinSystemPrompt,
  buildConversationHistory
} from "@/lib/twin-prompt";
import type { Profile, TwinProfile, Message } from "@/lib/types";

/**
 * Generate a reply from a test-persona twin and insert it as a message
 * sent by that persona. Used to let a real user test their twin solo
 * against a pre-built sample twin.
 *
 * Auth: caller must be a participant of the conversation.
 * Constraint: the OTHER participant must be a test persona (is_test_persona).
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversation_id = body.conversation_id;
  if (!conversation_id) {
    return NextResponse.json(
      { error: "missing_conversation_id" },
      { status: 400 }
    );
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
  const dummyId =
    conv.participant_a === user.id ? conv.participant_b : conv.participant_a;

  // Verify the other participant is actually a test persona — this endpoint
  // must NEVER generate on behalf of a real user.
  const { data: dummyProfile } = await service
    .from("profiles")
    .select("id, email, display_name, is_test_persona, created_at")
    .eq("id", dummyId)
    .single();
  if (!dummyProfile?.is_test_persona) {
    return NextResponse.json(
      { error: "not_a_test_persona" },
      { status: 400 }
    );
  }

  const [
    { data: dummyTwin },
    { data: realProfile },
    { data: realTwin },
    { data: messages }
  ] = await Promise.all([
    service
      .from("twin_profiles")
      .select("*")
      .eq("user_id", dummyId)
      .maybeSingle(),
    service
      .from("profiles")
      .select("id, email, display_name, is_test_persona, created_at")
      .eq("id", user.id)
      .single(),
    service
      .from("twin_profiles")
      .select("goals, deal_preferences")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation_id)
      .order("sent_at", { ascending: true })
  ]);

  if (!dummyTwin) {
    return NextResponse.json(
      { error: "dummy_twin_not_seeded" },
      { status: 500 }
    );
  }

  // Build the prompt with the dummy as `self`. No edit deltas — test personas
  // don't have a meta-model to update.
  const systemPrompt = buildTwinSystemPrompt({
    self: dummyProfile as Profile,
    selfTwin: dummyTwin as TwinProfile,
    counterpart: realProfile as Profile,
    counterpartTwin:
      (realTwin as Pick<TwinProfile, "goals" | "deal_preferences">) ?? null,
    recentDeltas: [],
    goalOverride: conv.goal_override ?? null
  });

  const history = buildConversationHistory(
    (messages as Message[]) ?? [],
    dummyId
  );
  if (history.length === 0) {
    history.push({
      role: "user",
      content: "(No prior messages. Open the conversation with a substantive first message.)"
    });
  }

  let text: string;
  try {
    const { withAnthropicRetry, FriendlyAnthropicError } = await import(
      "@/lib/anthropic"
    );
    const response = await withAnthropicRetry(
      () =>
        anthropic.messages.create({
          model: TWIN_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: history
        }),
      { label: "generate-dummy-reply" }
    );
    text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
  } catch (e: any) {
    console.error("dummy generation error", e);
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: e?.message ?? String(e),
        retryable: !!e?.retryable
      },
      { status: e?.status === 529 ? 503 : 500 }
    );
  }

  // Auto-insert as a message from the dummy (no edit step, since there's
  // no human on the other side to edit).
  const { data: message, error } = await service
    .from("messages")
    .insert({
      conversation_id,
      sender_user_id: dummyId,
      original_draft: text,
      final_text: text,
      edited: false
    })
    .select("*")
    .single();

  if (error || !message) {
    console.error("dummy message insert failed", error);
    return NextResponse.json(
      { error: "insert_failed", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ message });
}
