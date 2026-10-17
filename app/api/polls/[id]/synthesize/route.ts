import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

const HEADLINE_MAX = 240;

/** Word/sentence-boundary aware truncation. Matches the version in
 *  /api/polls/create so re-synthesis headlines clamp identically. */
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

/**
 * Re-synthesize an existing poll's responses — useful after human
 * overrides have come in since the original run. Any signed-in user can
 * trigger this; the new synthesis replaces the old one.
 */
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
  const { data: poll } = await service
    .from("polls")
    .select("id, question, context")
    .eq("id", params.id)
    .maybeSingle();
  if (!poll) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: responsesData } = await service
    .from("poll_responses")
    .select(
      "id, twin_user_id, twin_response, human_override, was_overridden"
    )
    .eq("poll_id", params.id);
  const responses = (responsesData ?? []) as Array<{
    id: string;
    twin_user_id: string;
    twin_response: string;
    human_override: string | null;
    was_overridden: boolean;
  }>;
  if (responses.length === 0) {
    return NextResponse.json({ error: "no_responses" }, { status: 400 });
  }

  // Names for the synthesis prompt.
  const userIds = responses.map((r) => r.twin_user_id);
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

  const rows = responses.map((r) => ({
    name: namesById[r.twin_user_id] || "Someone",
    answer:
      r.was_overridden && r.human_override
        ? r.human_override
        : r.twin_response,
    isOverride: r.was_overridden
  }));

  const system = `You read N first-person twin responses to a single poll question and produce a synthesis. Output STRICT JSON:
{
  "one_liner": "<ONE complete sentence — the headline finding. Full sentence, no trailing fragments. Aim for 15-30 words.>",
  "paragraph": "<3-5 sentences. Quantify what fraction of respondents leaned which way. Name 1-2 distinctive outlier takes. Land on what the network collectively believes.>"
}

Rules:
- Voice is neutral / analytical, NOT promotional.
- Responses marked (override) are human-corrected ground truth — weight them more heavily than their LLM-generated counterparts.
- NO em-dashes, NO emojis, NO markdown.
- one_liner MUST be a complete sentence that stands on its own.
- Return ONLY the JSON, nothing else.`;

  const responseList = rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.name}${r.isOverride ? " (override)" : ""}: ${r.answer}`
    )
    .join("\n");

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 800,
      system,
      messages: [
        {
          role: "user",
          content: `POLL QUESTION: ${poll.question}
${poll.context ? `CONTEXT: ${poll.context}\n` : ""}
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
    let oneLiner = "Synthesis ready.";
    let paragraph = text;
    if (start !== -1 && end !== -1) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as {
          one_liner?: string;
          paragraph?: string;
        };
        oneLiner = clampHeadline(parsed.one_liner || oneLiner) || oneLiner;
        paragraph = (parsed.paragraph || paragraph).trim();
      } catch {
        /* fall through to defaults */
      }
    }

    await service
      .from("polls")
      .update({
        synthesis: paragraph,
        synthesis_one_liner: oneLiner,
        status: "ready",
        synthesized_at: new Date().toISOString()
      })
      .eq("id", params.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "llm_failed", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
