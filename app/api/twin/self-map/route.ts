import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { loadBlendedAiExports } from "@/lib/ai-exports";

/**
 * Self Map — a research-grounded "map of self" derived from the user's
 * twin context. Replaces the old free-form "self graph" constellation
 * with structured psychometrics so the visual means something.
 *
 * Frameworks (all peer-reviewed, widely used):
 *   - Big Five / OCEAN (McCrae & Costa) — trait structure.
 *   - Schwartz Theory of Basic Human Values — what the person prioritizes.
 *   - Self-Determination Theory (Deci & Ryan) — autonomy / competence /
 *     relatedness drives.
 *   - McAdams narrative identity — the one-line life theme.
 *
 * Honesty rule: this is an INFERENCE from limited self-report text, not a
 * validated assessment. The model is instructed to return null for any
 * trait the context doesn't actually support (rendered as "not enough
 * signal yet") rather than hallucinating a number. Confidence scales with
 * how much real context exists.
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

  // Blend the per-source AI exports (ChatGPT / Claude / etc. pastes stored
  // in the ai_exports table) with the main dump field. Without this, a
  // user who pasted rich context into the per-source panels saw an empty
  // map — "I posted my output and it's not showing here" (#9). Now the
  // map reads from EVERYTHING the user has pasted, not just the one box.
  let blendedExports: string | null = null;
  try {
    blendedExports = await loadBlendedAiExports(
      user.id,
      body.ai_export_blob ?? ""
    );
  } catch {
    blendedExports = (body.ai_export_blob ?? "").trim() || null;
  }

  const context = [
    body.goals ? `Goals: ${body.goals}` : "",
    body.deal_preferences ? `Deal preferences: ${body.deal_preferences}` : "",
    body.communication_style
      ? `Communication style: ${body.communication_style}`
      : "",
    body.deal_breakers ? `Deal breakers: ${body.deal_breakers}` : "",
    blendedExports ? `AI context dump:\n${blendedExports.slice(0, 9000)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  // Rough signal size — drives the confidence floor so a one-line goal
  // can't read as a "rich" portrait.
  const signalChars = context.replace(/\s+/g, " ").trim().length;

  if (signalChars < 40) {
    return NextResponse.json({
      name,
      confidence: "thin",
      identity: "",
      narrative: "",
      bigFive: [],
      values: [],
      drives: []
    });
  }

  const system = `You are a careful psychometric profiler. You read a person's self-description and produce a STRUCTURED "map of self" grounded in established frameworks. You infer cautiously from limited self-report text — this is a sketch, not a clinical assessment.

Return ONLY this exact JSON shape, no markdown, no preface:
{
  "identity": "<a single McAdams-style narrative-identity line in second person, ≤16 words, e.g. 'You build leverage by turning scattered effort into compounding systems.' Empty string if context is too thin.>",
  "narrative": "<2 sentences naming the through-line / life theme you actually see in the text. Empty string if too thin.>",
  "bigFive": [
    { "trait": "openness", "score": <0-100 or null>, "evidence": "<≤8 words of why, or empty>" },
    { "trait": "conscientiousness", "score": <0-100 or null>, "evidence": "" },
    { "trait": "extraversion", "score": <0-100 or null>, "evidence": "" },
    { "trait": "agreeableness", "score": <0-100 or null>, "evidence": "" },
    { "trait": "neuroticism", "score": <0-100 or null>, "evidence": "" }
  ],
  "values": [
    { "name": "<one Schwartz value: Self-Direction, Achievement, Power, Stimulation, Hedonism, Security, Conformity, Tradition, Benevolence, or Universalism>", "score": <0-100>, "note": "<≤7 words>" }
  ],
  "drives": [
    { "name": "Autonomy", "score": <0-100 or null>, "note": "<≤7 words>" },
    { "name": "Competence", "score": <0-100 or null>, "note": "" },
    { "name": "Relatedness", "score": <0-100 or null>, "note": "" }
  ]
}

Hard rules:
- ALWAYS return all 5 bigFive traits and all 3 drives in the fixed order above. Use null for score when the text gives you no real signal for that trait — do NOT guess a middling 50.
- "values": return 3 to 6 Schwartz values the text actually supports, highest score first. Skip values with no evidence.
- Scores reflect what the SELF-DESCRIPTION shows, not a flattering portrait. Neuroticism can be low; that's fine.
- Never invent biographical facts. Evidence/notes must be paraphrases of what's in the text.
- Return ONLY the JSON object.`;

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 1100,
      system,
      messages: [
        {
          role: "user",
          content: `Person's name: ${name}\n\nTheir self-description:\n${context}\n\nReturn the JSON self-map.`
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
        name,
        confidence: "thin",
        identity: "",
        narrative: "",
        bigFive: [],
        values: [],
        drives: []
      });
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    // Confidence: how much of the portrait the model could actually fill,
    // floored by raw signal size so a sparse profile can't read "rich".
    const fiveKnown = (parsed.bigFive ?? []).filter(
      (t: any) => typeof t?.score === "number"
    ).length;
    let confidence: "thin" | "forming" | "rich" = "thin";
    if (signalChars > 900 && fiveKnown >= 4) confidence = "rich";
    else if (signalChars > 250 && fiveKnown >= 2) confidence = "forming";
    return NextResponse.json({ name, confidence, ...parsed });
  } catch (e: any) {
    console.error("self-map error", e);
    return NextResponse.json(
      { error: "self_map_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
