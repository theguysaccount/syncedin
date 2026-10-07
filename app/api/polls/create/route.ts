import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { contentSafetyResponse } from "@/lib/content-safety";

/**
 * Create a new platform-wide poll, generate one response per twin on the
 * platform (capped at MAX_TWINS so we stay under a sane Claude budget),
 * then synthesize all responses into a single paragraph + one-liner.
 *
 * Body: { question: string, context?: string }
 *
 * Returns: { id: string, status: "ready" | "running" }
 *
 * Implementation notes:
 *   - Twins are selected from `twin_profiles` where the user has a real
 *     blob/goals (otherwise the response is hollow).
 *   - We fan-out responses in parallel batches of 8 so the round-trip
 *     stays under Vercel's 30s edge timeout.
 *   - Test personas ARE included — their twins also represent a slice of
 *     the network and improve aggregate signal.
 */

const MAX_TWINS = 60; // hard cap for a single poll run
const HEADLINE_MAX = 240; // soft cap for the one-liner synthesis headline

/**
 * Clamp the synthesis one-liner to a usable length without truncating
 * mid-word. If the headline is already short enough, returns it unchanged.
 * Otherwise: cut at the LAST sentence boundary that fits, falling back to
 * the last whitespace boundary, then append an ellipsis only if we cut
 * mid-sentence. Prevents the "respondents agree…, individual discipline,
 * systemic ownership, institutional scale, and hi" mid-word truncation
 * we shipped on the first poll.
 */
function clampHeadline(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.length <= HEADLINE_MAX) return s;
  const window = s.slice(0, HEADLINE_MAX);
  // Prefer a sentence ending (.!?).
  const sentenceEnd = Math.max(
    window.lastIndexOf("."),
    window.lastIndexOf("!"),
    window.lastIndexOf("?")
  );
  if (sentenceEnd > HEADLINE_MAX * 0.6) {
    return window.slice(0, sentenceEnd + 1).trim();
  }
  // Otherwise cut at last space.
  const space = window.lastIndexOf(" ");
  if (space > 40) return window.slice(0, space).trim() + "…";
  return window.trim() + "…";
}

type TwinRow = {
  user_id: string;
  goals: string | null;
  deal_preferences: string | null;
  communication_style: string | null;
  deal_breakers: string | null;
  ai_export_blob: string | null;
  profiles?: {
    display_name: string | null;
    email: string | null;
  } | null;
};

function twinSystemPrompt(question: string, context: string): string {
  return `You are answering a platform-wide poll on behalf of ONE specific person, based on what their digital twin profile says about them. Give a SHORT, first-person answer in 1-3 sentences that genuinely reflects this individual's stated goals, voice, and stance.

POLL QUESTION:
${question}
${context ? `\nADDITIONAL CONTEXT:\n${context}\n` : ""}
Rules:
- First person, casual, 1-3 sentences max.
- If their profile doesn't give a clear stance on this, give your BEST GUESS in their voice and add "(guess)" at the end of the sentence — don't refuse.
- NO em-dashes, NO markdown, NO hashtags.
- Don't introduce yourself. Just answer the question directly.`;
}

async function twinAnswer(
  t: TwinRow,
  question: string,
  context: string
): Promise<string> {
  const name = t.profiles?.display_name || "this person";
  const userMsg = `${name}'s twin profile:

Goals: ${t.goals || "(none specified)"}
Deal preferences: ${t.deal_preferences || "(none specified)"}
Communication style: ${t.communication_style || "(default)"}
Deal-breakers: ${t.deal_breakers || "(none specified)"}
Voice / about-me: ${
    t.ai_export_blob ? t.ai_export_blob.slice(0, 1200) : "(none specified)"
  }

Now answer the poll as ${name}.`;

  const r = await anthropic.messages.create({
    model: TWIN_MODEL,
    max_tokens: 180,
    system: twinSystemPrompt(question, context),
    messages: [{ role: "user", content: userMsg }]
  });
  return r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}

async function synthesize(
  question: string,
  context: string,
  rows: Array<{ name: string; answer: string; isOverride: boolean }>
): Promise<{ paragraph: string; oneLiner: string }> {
  const system = `You read N first-person twin responses to a single poll question and produce a synthesis. Output STRICT JSON:
{
  "one_liner": "<ONE complete sentence — the headline finding. Must be a full sentence, no trailing fragments. Aim for 15-30 words.>",
  "paragraph": "<3-5 sentences. Quantify what fraction of respondents leaned which way. Name 1-2 distinctive outlier takes. Land on what the network collectively believes.>"
}

Rules:
- Voice is neutral / analytical, NOT promotional.
- If multiple respondents are marked (override) — meaning the human corrected their twin's answer — weight those more heavily, since they're ground truth from the actual person.
- NO em-dashes, NO emojis, NO markdown.
- one_liner MUST be a complete sentence that stands on its own.
- Return ONLY the JSON, nothing else.`;

  const responseList = rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.name}${r.isOverride ? " (override — human-corrected)" : ""}: ${r.answer}`
    )
    .join("\n");

  const userMsg = `POLL QUESTION: ${question}
${context ? `CONTEXT: ${context}\n` : ""}
${rows.length} responses:

${responseList}

Return the JSON synthesis now.`;

  const r = await anthropic.messages.create({
    model: TWIN_MODEL,
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: userMsg }]
  });
  const text = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return {
      paragraph: text.slice(0, 800),
      oneLiner: clampHeadline(text) || "Synthesis ready."
    };
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      one_liner?: string;
      paragraph?: string;
    };
    return {
      paragraph: (parsed.paragraph || "").trim(),
      oneLiner: clampHeadline((parsed.one_liner || "").trim())
    };
  } catch {
    return {
      paragraph: text.slice(0, 800),
      oneLiner: "Synthesis ready."
    };
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

  let body: { question?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  const context = (body.context ?? "").trim();
  if (!question || question.length < 6) {
    return NextResponse.json(
      { error: "question_too_short" },
      { status: 400 }
    );
  }

  const safety = await contentSafetyResponse(`${question}\n${context}`, user.id);
  if (safety) return safety;
  const service = createServiceClient();

  // 1) Create the poll row.
  const { data: pollRow, error: pollErr } = await service
    .from("polls")
    .insert({
      created_by: user.id,
      question,
      context: context || null,
      status: "running"
    })
    .select("id")
    .single();
  if (pollErr || !pollRow) {
    return NextResponse.json(
      { error: "poll_create_failed", detail: pollErr?.message },
      { status: 500 }
    );
  }
  const pollId = pollRow.id as string;

  // 2) Pull every twin profile with enough signal to answer.
  const { data: twins } = await service
    .from("twin_profiles")
    .select(
      "user_id, goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, profiles:profiles!inner(display_name, email)"
    )
    .order("updated_at", { ascending: false })
    .limit(MAX_TWINS * 2);
  const allTwins = ((twins as any[]) ?? []).filter(
    (t) =>
      (t.goals && t.goals.trim().length > 5) ||
      (t.ai_export_blob && t.ai_export_blob.trim().length > 40)
  );
  const sample = allTwins.slice(0, MAX_TWINS) as TwinRow[];

  if (sample.length === 0) {
    await service
      .from("polls")
      .update({
        status: "ready",
        synthesis: "No twins on the platform have enough signal yet to answer this poll.",
        synthesis_one_liner: "Network too small to poll.",
        synthesized_at: new Date().toISOString()
      })
      .eq("id", pollId);
    return NextResponse.json({ id: pollId, status: "ready" });
  }

  // 3) Fan-out twin answers in parallel batches of 8.
  const BATCH = 8;
  const responses: Array<{
    twin_user_id: string;
    twin_response: string;
    name: string;
  }> = [];
  for (let i = 0; i < sample.length; i += BATCH) {
    const slice = sample.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map(async (t) => ({
        twin_user_id: t.user_id,
        twin_response: await twinAnswer(t, question, context),
        name: t.profiles?.display_name || t.profiles?.email || "Someone"
      }))
    );
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.twin_response) {
        responses.push(s.value);
      }
    }
  }

  if (responses.length === 0) {
    await service
      .from("polls")
      .update({
        status: "ready",
        synthesis: "All twin responses failed to generate. Try again.",
        synthesis_one_liner: "Generation failed.",
        synthesized_at: new Date().toISOString()
      })
      .eq("id", pollId);
    return NextResponse.json({ id: pollId, status: "ready" });
  }

  // 4) Persist twin responses.
  await service.from("poll_responses").insert(
    responses.map((r) => ({
      poll_id: pollId,
      twin_user_id: r.twin_user_id,
      twin_response: r.twin_response
    }))
  );

  // 5) Synthesize.
  const synth = await synthesize(
    question,
    context,
    responses.map((r) => ({
      name: r.name,
      answer: r.twin_response,
      isOverride: false
    }))
  );

  await service
    .from("polls")
    .update({
      status: "ready",
      synthesis: synth.paragraph,
      synthesis_one_liner: synth.oneLiner,
      responses_count: responses.length,
      synthesized_at: new Date().toISOString()
    })
    .eq("id", pollId);

  return NextResponse.json({
    id: pollId,
    status: "ready",
    responses: responses.length
  });
}
