import { NextResponse } from "next/server";
import { connectionBlocked } from "@/lib/user-safety";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  anthropic,
  TWIN_MODEL,
  withAnthropicRetry,
  FriendlyAnthropicError
} from "@/lib/anthropic";
import {
  buildTwinSystemPrompt,
  buildConversationHistory,
  scrubAiTells
} from "@/lib/twin-prompt";
import type { Profile, TwinProfile, Message, EditDelta } from "@/lib/types";
import { loadBlendedAiExports } from "@/lib/ai-exports";

export async function POST(req: Request) {
  const supabase = createClient();
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
  const otherId =
    conv.participant_a === user.id ? conv.participant_b : conv.participant_a;
  if (await connectionBlocked(user.id, otherId)) return NextResponse.json({ error: "This connection is blocked." }, { status: 403 });

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
    return NextResponse.json(
      {
        error: "twin_not_set_up",
        hint: "Complete your twin profile in /onboarding first."
      },
      { status: 400 }
    );
  }

  // #169 — blend the legacy `ai_export_blob` with all multi-source rows
  // from `ai_exports` (Claude + ChatGPT + Gemini + Perplexity + Grok)
  // so the twin reads from every source the user pasted.
  const blendedExport = await loadBlendedAiExports(
    user.id,
    (selfTwin as any)?.ai_export_blob ?? null
  );
  const selfTwinForPrompt = {
    ...(selfTwin as TwinProfile),
    ai_export_blob: blendedExport ?? (selfTwin as any)?.ai_export_blob ?? null
  } as TwinProfile;

  const systemPrompt = buildTwinSystemPrompt({
    self: selfProfile as Profile,
    selfTwin: selfTwinForPrompt,
    counterpart: otherProfile as Profile,
    counterpartTwin:
      (otherTwin as Pick<TwinProfile, "goals" | "deal_preferences">) ?? null,
    recentDeltas: (deltas as EditDelta[]) ?? [],
    goalOverride: (conv as any)?.goal_override ?? null
  });

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
    const response = await withAnthropicRetry(
      () =>
        anthropic.messages.create({
          model: TWIN_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: history
        }),
      { label: "generate-message" }
    );
    const text = scrubAiTells(
      response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim()
    );
    return NextResponse.json({ draft: text });
  } catch (e: any) {
    console.error("anthropic generate error", e);
    const friendly =
      e instanceof FriendlyAnthropicError
        ? e.message
        : e?.message ?? String(e);
    const status =
      e instanceof FriendlyAnthropicError && e.retryable ? 503 : 500;
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: friendly,
        retryable: e instanceof FriendlyAnthropicError ? e.retryable : false
      },
      { status }
    );
  }
}
