import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Extract a "self graph" from the user's onboarding context.
 *
 * Returns a small graph of concept clusters around a central "you" node:
 *   - goals
 *   - projects
 *   - relationships
 *   - deal preferences
 *   - deal breakers
 *   - communication style traits
 *   - skills / superpowers
 *
 * Each item is a leaf node with a short label (2-4 words). The graph
 * regenerates client-side every time the form context changes.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    goals?: string;
    deal_preferences?: string;
    communication_style?: string;
    deal_breakers?: string;
    ai_export_blob?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim() || "you";
  // Total context — capped so the call stays snappy.
  const context = [
    body.goals ? `Goals: ${body.goals}` : "",
    body.deal_preferences ? `Deal preferences: ${body.deal_preferences}` : "",
    body.communication_style
      ? `Communication style: ${body.communication_style}`
      : "",
    body.deal_breakers ? `Deal breakers: ${body.deal_breakers}` : "",
    body.ai_export_blob
      ? `AI context dump:\n${body.ai_export_blob.slice(0, 6000)}`
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!context.trim()) {
    return NextResponse.json({
      clusters: [],
      center: { id: "self", label: name }
    });
  }

  const system = `You read a person's self-description and return a compact "self graph" as strict JSON. The graph has one center node (the person) and several CLUSTERS of leaf nodes around it, grouped by category.

Return ONLY this exact JSON shape, nothing else:
{
  "center": { "id": "self", "label": "<the person's first name or 'you'>" },
  "clusters": [
    {
      "category": "<one of: goals, projects, people, deal_preferences, deal_breakers, style, skills>",
      "label": "<2-3 word category label, title case>",
      "items": [
        { "id": "<unique kebab-case id>", "label": "<2-5 word punchy label>" }
      ]
    }
  ]
}

Hard rules:
- 3 to 7 clusters total. Pick the ones the context actually supports. Skip empty ones.
- 2 to 6 items per cluster. No padding. Each item is a specific concrete noun phrase, never a sentence.
- Item labels are 2 to 5 words, lowercase or title case, no punctuation, no quotes, no emojis.
- Skip anything you're guessing about. Only emit what the context clearly supports.
- The category "people" is for named individuals or roles ("co-founder Mark", "Persist team"). Other categories are for things, not people.
- Return ONLY the JSON object. No markdown, no preface, no trailing text.`;

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 1200,
      system,
      messages: [
        {
          role: "user",
          content: `Person's name: ${name}\n\nTheir self-description:\n${context}\n\nReturn the JSON graph.`
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
      return NextResponse.json({
        clusters: [],
        center: { id: "self", label: name }
      });
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error("extract-knowledge-graph error", e);
    return NextResponse.json(
      { error: "extract_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
