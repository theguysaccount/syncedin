import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Poll twins who HAVEN'T answered this poll yet.
 *
 * Polls are time-pinned — they capture a snapshot of the network at the
 * moment they're created. But the network keeps growing: new twins sign
 * up, existing twins get richer profiles. Without this endpoint, an old
 * poll stays frozen with N original responses and never picks up the
 * 50 twins who joined since.
 *
 * This route:
 *   1. Loads every twin_profile with enough signal to answer.
 *   2. Excludes twins that already have a poll_response row for this poll.
 *   3. Fans out new answers in parallel batches.
 *   4. Persists the new responses.
 *   5. Re-synthesizes the whole poll with the larger response set so the
 *      headline + paragraph reflect the new evidence.
 *
 * Safe to call repeatedly — if no missing twins exist it returns
 * { added: 0 } and skips the LLM call.
 */

const MAX_NEW = 60; // hard cap per single retroactive run
const HEADLINE_MAX = 240;

function clampHeadline(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.length <= HEADLINE_MAX) return s;
  const window = s.slice(0, HEADLINE_MAX);
  const sentenceEnd = Math.max(
    window.lastIndexOf("."),
    window.lastIndexOf("!"),
    window.lastIndexOf("?")
  );
  if (sentenceEnd > HEADLINE_MAX * 0.6) {
    return window.slice(0, sentenceEnd + 1).trim();
  }
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

async function synthesizeAll(
  question: string,
  context: string,
  rows: Array<{ name: string; answer: string; isOverride: boolean }>
): Promise<{ paragraph: string; oneLiner: string }> {
  const system = `You read N first-person twin responses to a single poll question and produce a synthesis. Output STRICT JSON:
{
  "one_liner": "<ONE complete sentence — the headline finding. Full sentence, no trailing fragments. Aim for 15-30 words.>",
  "paragraph": "<3-5 sentences. Quantify what fraction of respondents leaned which way. Name 1-2 distinctive outlier takes. Land on what the network collectively believes.>"
}

Rules:
- Voice is neutral / analytical, NOT promotional.
- Responses marked (override) are human-corrected ground truth — weight them more heavily.
- NO em-dashes, NO emojis, NO markdown.
- one_liner MUST be a complete sentence that stands on its own.
- Return ONLY the JSON, nothing else.`;

  const responseList = rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.name}${r.isOverride ? " (override)" : ""}: ${r.answer}`
    )
    .join("\n");

  const r = await anthropic.messages.create({
    model: TWIN_MODEL,
    max_tokens: 800,
    system,
    messages: [
      {
        role: "user",
        content: `POLL QUESTION: ${question}
${context ? `CONTEXT: ${context}\n` : ""}
${rows.length} responses:

${responseList}

Return the JSON synthesis now.`
      }
    ]
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

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Poll metadata.
  const { data: poll } = await service
    .from("polls")
    .select("id, question, context")
    .eq("id", params.id)
    .maybeSingle();
  if (!poll) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Who already answered.
  const { data: existingResponses } = await service
    .from("poll_responses")
    .select(
      "id, twin_user_id, twin_response, human_override, was_overridden"
    )
    .eq("poll_id", params.id);
  const existingByUser = new Map<
    string,
    {
      id: string;
      twin_response: string;
      human_override: string | null;
      was_overridden: boolean;
    }
  >();
  for (const r of (existingResponses ?? []) as any[]) {
    existingByUser.set(r.twin_user_id, r);
  }

  // Every twin with signal.
  const { data: twins } = await service
    .from("twin_profiles")
    .select(
      "user_id, goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, profiles:profiles!inner(display_name, email)"
    )
    .order("updated_at", { ascending: false })
    .limit(400);
  const allTwins = ((twins as any[]) ?? []).filter(
    (t) =>
      (t.goals && t.goals.trim().length > 5) ||
      (t.ai_export_blob && t.ai_export_blob.trim().length > 40)
  );

  // Twins that haven't answered yet.
  const missing = allTwins
    .filter((t) => !existingByUser.has(t.user_id))
    .slice(0, MAX_NEW) as TwinRow[];

  if (missing.length === 0) {
    return NextResponse.json({ added: 0, total: existingByUser.size });
  }

  // Generate.
  const BATCH = 8;
  const newResponses: Array<{
    twin_user_id: string;
    twin_response: string;
    name: string;
  }> = [];
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map(async (t) => ({
        twin_user_id: t.user_id,
        twin_response: await twinAnswer(
          t,
          poll.question as string,
          (poll.context as string | null) || ""
        ),
        name: t.profiles?.display_name || t.profiles?.email || "Someone"
      }))
    );
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.twin_response) {
        newResponses.push(s.value);
      }
    }
  }

  if (newResponses.length === 0) {
    return NextResponse.json({ added: 0, total: existingByUser.size });
  }

  await service.from("poll_responses").insert(
    newResponses.map((r) => ({
      poll_id: params.id,
      twin_user_id: r.twin_user_id,
      twin_response: r.twin_response
    }))
  );

  // Re-synthesize with EVERY response (existing + new).
  const userIds = [
    ...Array.from(existingByUser.keys()),
    ...newResponses.map((r) => r.twin_user_id)
  ];
  const { data: profilesData } = await service
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds);
  const namesById = ((profilesData ?? []) as any[]).reduce<
    Record<string, string>
  >((acc, p) => {
    acc[p.id] = p.display_name || p.email?.split("@")[0] || "Someone";
    return acc;
  }, {});

  const allRows = [
    ...Array.from(existingByUser.entries()).map(([uid, r]) => ({
      name: namesById[uid] || "Someone",
      answer: r.was_overridden && r.human_override ? r.human_override : r.twin_response,
      isOverride: r.was_overridden
    })),
    ...newResponses.map((r) => ({
      name: r.name,
      answer: r.twin_response,
      isOverride: false
    }))
  ];

  const synth = await synthesizeAll(
    poll.question as string,
    (poll.context as string | null) || "",
    allRows
  );

  const totalCount = existingByUser.size + newResponses.length;
  await service
    .from("polls")
    .update({
      synthesis: synth.paragraph,
      synthesis_one_liner: synth.oneLiner,
      responses_count: totalCount,
      status: "ready",
      synthesized_at: new Date().toISOString()
    })
    .eq("id", params.id);

  return NextResponse.json({
    added: newResponses.length,
    total: totalCount
  });
}
