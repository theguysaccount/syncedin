import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { DEFAULT_SCORING_PROMPT } from "@/lib/scoring";
import type { Profile, TwinProfile, Message } from "@/lib/types";

/**
 * After a conversation completes, generate:
 *  - summary: one line on where it ended up
 *  - counterpart_summary: one or two lines on who the other person is
 *  - excitement_score: 0-100, how high-potential this connection is
 *
 * The score is only written if the user hasn't manually locked it — a manual
 * override stays put and is kept as a calibration signal.
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
    return NextResponse.json({ error: "missing_conversation_id" }, { status: 400 });
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
    { data: otherProfile },
    { data: otherTwin },
    { data: messages },
    { data: customPromptRow },
    { data: calibrations }
  ] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id).single(),
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
      .from("scoring_prompts")
      .select("prompt")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("scoring_calibrations")
      .select("ai_score, user_score, reason")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const scoringRubric =
    (customPromptRow as { prompt?: string } | null)?.prompt ??
    DEFAULT_SCORING_PROMPT;
  const calibrationDeltas = (calibrations as Array<{
    ai_score: number | null;
    user_score: number;
    reason: string | null;
  }> | null) ?? [];
  const calibrationsText = calibrationDeltas.length
    ? `\n\n# Past calibrations from this user (the user OVERRODE the AI's score — match their taste)\n` +
      calibrationDeltas
        .map(
          (c, i) =>
            `${i + 1}. AI scored ${c.ai_score ?? "?"} → user corrected to ${c.user_score}${
              c.reason ? ` (${c.reason})` : ""
            }`
        )
        .join("\n")
    : "";

  const selfName =
    (selfProfile as Profile)?.display_name ||
    (selfProfile as Profile)?.email ||
    "you";
  const otherName =
    (otherProfile as Profile)?.display_name ||
    (otherProfile as Profile)?.email ||
    "the other person";
  const msgs = (messages as Message[]) ?? [];

  // Vacuous-conversation guard. Jack: proposals page is polluted with
  // "No conversation occurred" / "One-sided opener only" entries. Root
  // cause: summarize ran on conversations that barely happened (just
  // an opener, no twin reply). REFUSE to write a summary unless the
  // conversation has at least 4 messages AND messages from BOTH sides.
  // Keeps the proposals list clean + saves an Anthropic call.
  const senderIds = new Set(msgs.map((m) => m.sender_user_id));
  if (msgs.length < 4 || senderIds.size < 2) {
    return NextResponse.json(
      {
        error: "conversation_too_thin",
        detail:
          "Need at least 4 messages from both sides before summarizing. The proposals page would otherwise show a vacuous 'no conversation occurred' entry."
      },
      { status: 400 }
    );
  }

  const transcript = msgs
    .map((m) => `${m.sender_user_id === user.id ? selfName : otherName}: ${m.final_text}`)
    .join("\n");

  const ot = otherTwin as Pick<TwinProfile, "goals" | "deal_preferences"> | null;

  const systemPrompt = `You analyze a completed agent-to-agent conversation between two people's digital twins and return a compact JSON object — nothing else.

# How to score (for ${selfName})
${scoringRubric}${calibrationsText}

Return ONLY valid JSON with exactly these keys:
{
  "summary": "<=22 words — where the conversation actually ended up: what was agreed, concluded, or the concrete next step. Plain, specific, no hype.",
  "counterpart_summary": "<=28 words — who ${otherName} is and what they're about, from the conversation + their profile. Useful for ${selfName} scanning their connections.",
  "excitement_score": <integer 0-100, scored using the rubric and past calibrations above>
}`;

  const userContent = `${otherName}'s stated goals: ${ot?.goals || "(unknown)"}
${otherName}'s deal preferences: ${ot?.deal_preferences || "(unknown)"}

CONVERSATION TRANSCRIPT:
${transcript || "(no messages)"}`;

  let parsed: {
    summary?: string;
    counterpart_summary?: string;
    excitement_score?: number;
  } = {};
  try {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }
  } catch (e: any) {
    console.error("summarize-conversation generation error", e);
    return NextResponse.json(
      { error: "summarize_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }

  const summary = (parsed.summary ?? "").toString().slice(0, 400) || null;
  const counterpart_summary =
    (parsed.counterpart_summary ?? "").toString().slice(0, 400) || null;
  let score: number | null =
    typeof parsed.excitement_score === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.excitement_score)))
      : null;

  // Don't overwrite a score the user manually locked.
  const update: Record<string, unknown> = { summary, counterpart_summary };
  if (!conv.excitement_locked && score !== null) {
    update.excitement_score = score;
  } else if (conv.excitement_locked) {
    score = conv.excitement_score;
  }

  const { error: updErr } = await service
    .from("conversations")
    .update(update)
    .eq("id", conversation_id);
  if (updErr) {
    return NextResponse.json(
      { error: "save_failed", detail: updErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    summary,
    counterpart_summary,
    excitement_score: score
  });
}
