import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * CONTEXT-TO-CONTEXT DIVE.
 *
 * Jack's architecture shift:
 *
 *   Old model — the visible message stack between two twins IS the
 *   coordination layer. Each turn is informed by the prior turn plus
 *   the twin's own context. This conflates two jobs:
 *     1. Coordination (figure out the win-win)
 *     2. Presentation (a thread the user can read)
 *   Doing both at once means messages are long and the coordination
 *   only emerges turn-by-turn.
 *
 *   New model — run a ONE-SHOT background analysis that ingests BOTH
 *   participants' FULL twin contexts and produces the underlying
 *   alignment (shared themes, complementary asks/offers, friction
 *   points, recommended destination) before any messages are
 *   generated. The surface conversation then becomes a shorter,
 *   pragmatic presentation of what the dive already discovered.
 *
 * GET  /api/conversations/[id]/context-dive
 *   → returns the existing dive (or null if not run yet)
 * POST /api/conversations/[id]/context-dive
 *   → generates a fresh dive and persists to
 *     conversations.context_dive jsonb. Idempotent if `force=false`
 *     (returns the cached dive if already present); regenerates if
 *     `force=true`.
 *
 * The generate route reads this dive as additional system context
 * when producing each twin-to-twin message, so the surface
 * conversation can stay short — coordination already happened
 * off-stage.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, context_dive, context_dive_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    dive: (conv as any).context_dive ?? null,
    generated_at: (conv as any).context_dive_at ?? null
  });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, context_dive")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!force && (conv as any).context_dive) {
    return NextResponse.json({
      dive: (conv as any).context_dive,
      cached: true
    });
  }

  // Pull both sides — profiles + full twin context.
  const ids = [conv.participant_a, conv.participant_b];
  const [{ data: profs }, { data: twins }] = await Promise.all([
    service.from("profiles").select("id, display_name, email").in("id", ids),
    service
      .from("twin_profiles")
      .select(
        "user_id, goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city, achievements"
      )
      .in("user_id", ids)
  ]);
  const profileById = new Map(
    ((profs ?? []) as any[]).map((p) => [p.id, p])
  );
  const twinById = new Map(
    ((twins ?? []) as any[]).map((t) => [t.user_id, t])
  );

  const profA = profileById.get(conv.participant_a) ?? {};
  const profB = profileById.get(conv.participant_b) ?? {};
  const twinA = twinById.get(conv.participant_a) ?? {};
  const twinB = twinById.get(conv.participant_b) ?? {};

  const nameA = profA.display_name || profA.email || "Person A";
  const nameB = profB.display_name || profB.email || "Person B";

  function block(name: string, twin: any): string {
    return [
      `### ${name}`,
      twin.goals && `Goals: ${twin.goals}`,
      twin.deal_preferences && `Offers / deal preferences: ${twin.deal_preferences}`,
      twin.communication_style && `Communication style: ${twin.communication_style}`,
      twin.deal_breakers && `Deal breakers: ${twin.deal_breakers}`,
      twin.achievements && `Achievements: ${twin.achievements}`,
      (twin.hometown || twin.current_city) &&
        `Location: ${twin.current_city ?? ""}${
          twin.current_city && twin.hometown ? " · from " : ""
        }${twin.hometown ?? ""}`,
      twin.ai_export_blob &&
        `Deep context (their own export, may include scrape data):\n${(twin.ai_export_blob as string).slice(0, 8000)}`
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const systemPrompt = `You're the COORDINATION LAYER between two people's digital twins. You see BOTH sides' full contexts and produce the underlying alignment between them — what they share, what they could trade, where they would clash, and what concrete next step makes sense if they actually want to work together.

This analysis is the SUBSTRATE under the visible twin-to-twin conversation. The surface chat will be a short, pragmatic presentation of what you discover here. Your job is to find the REAL win-win, not to soften it.

Return ONLY JSON in this exact shape, no commentary:

{
  "headline": "<=12 words. A single-sentence read on what these two could actually do together. Specific and pointed.",
  "shared_themes": [
    "<=20 words each. The 2-5 substantive overlaps in their worldview, ambition, or focus area. Skip vague stuff like 'both ambitious'."
  ],
  "complementary_asks": [
    {
      "ask_from": "${nameA}",
      "offer_from": "${nameB}",
      "why": "<=24 words. Why this specific pairing makes sense — concrete, not 'they could help each other'."
    }
  ],
  "frictions": [
    "<=22 words each. Real friction points — different stages, opposite communication styles, stated deal breakers that the other side trips. Be honest, not alarmist."
  ],
  "hidden_synergies": [
    "<=24 words each. Non-obvious connections only visible because you see BOTH contexts at once. The 'wow they would never have realized' overlaps."
  ],
  "recommended_destination": "<=30 words. The single concrete next step worth proposing — who does what, on what channel, in what timeframe. The proposal a great mutual friend would suggest after hearing both sides."
}

Hard rules:
- No fluff. Every line should reference a specific detail from one of the context blocks below.
- If a section has nothing real (e.g. no frictions, no hidden synergies), return an empty array. Don't manufacture entries.
- Use ${nameA} and ${nameB} as the names exactly, not "Person A" / "Person B" or generic pronouns.
- The recommended_destination must be ACTIONABLE — a meeting time + topic, a specific intro, a draft to review, a deal term to test. Not "discuss further."`;

  const userContent = `${block(nameA, twinA)}\n\n${block(nameB, twinB)}`;

  let parsed: any = null;
  try {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("Model did not return JSON.");
    }
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "dive_generation_failed",
        detail: e?.message ?? String(e)
      },
      { status: 500 }
    );
  }

  // Light schema check — the surface UI relies on these fields existing.
  if (
    !parsed ||
    typeof parsed.headline !== "string" ||
    !Array.isArray(parsed.shared_themes) ||
    typeof parsed.recommended_destination !== "string"
  ) {
    return NextResponse.json(
      {
        error: "bad_shape",
        detail: "Dive succeeded but the response was missing required fields."
      },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  parsed.generated_at = now;
  const { error } = await service
    .from("conversations")
    .update({ context_dive: parsed, context_dive_at: now })
    .eq("id", params.id);
  if (error) {
    if (/context_dive|column|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Run: alter table public.conversations add column if not exists context_dive jsonb; alter table public.conversations add column if not exists context_dive_at timestamptz;"
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ dive: parsed, cached: false });
}
