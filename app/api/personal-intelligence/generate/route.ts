import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  anthropic,
  TWIN_MODEL,
  withAnthropicRetry,
  FriendlyAnthropicError
} from "@/lib/anthropic";

/**
 * Universal Personal-Intelligence text generator. Single API that all
 * the PI modules (life-path, plot, business, images, song, merch) call
 * with a `kind` field. Each kind gets a tailored prompt; everything
 * else (twin context fetch, retry, JSON parse) is shared.
 *
 * No real image / audio / print generation is wired up yet — those
 * cost money + need vendor accounts. This ships TEXT-BASED v1s of
 * every module: descriptions, prompts, lyrics drafts, concept boards,
 * etc. Once the user sees text that's clearly THEIRS, the actual
 * media-gen integrations land behind these existing UI surfaces.
 */
const KINDS = new Set([
  "life-path",
  "plot",
  "business",
  "images",
  "song",
  "merch"
]);

type Kind =
  | "life-path"
  | "plot"
  | "business"
  | "images"
  | "song"
  | "merch";

function promptFor(kind: Kind, name: string): string {
  switch (kind) {
    case "life-path":
      return `You're producing ${name}'s LIFE PATH BLUEPRINT — a visual map of where they've been, where the network thinks they're headed, and the highest-leverage next moves. Use everything in their twin context.

Return JSON ONLY in this shape:
{
  "headline": "one-line read on the arc",
  "stages": [
    { "label": "stage name", "summary": "1-2 sentence read", "year_band": "e.g. 2018-2021" }
  ],
  "current_chapter": "one-paragraph read on where they are NOW",
  "next_moves": [
    { "action": "concrete next move", "why": "one-sentence rationale" }
  ],
  "ten_year_arc": "where this likely lands if compounded"
}

5 stages, 3-5 next moves. Be specific, name companies / projects / people mentioned in their context.`;

    case "plot":
      return `You're sketching THREE different fictional plots based on ${name}'s real story arc. A memoir-shaped one, a novel-shaped one, a screenplay-shaped one.

Return JSON ONLY:
{
  "memoir": { "title": "...", "logline": "one-sentence pitch", "outline": "3-paragraph arc" },
  "novel": { "title": "...", "logline": "...", "outline": "..." },
  "screenplay": { "title": "...", "logline": "...", "outline": "..." }
}

Use specific details from their context — make these recognizable as THEIR story, lightly fictionalized.`;

    case "business":
      return `You're projecting a HUGE-SUCCESS scenario for ${name}'s primary business / venture (from their twin context). Be bullish but grounded.

Return JSON ONLY:
{
  "venture_name": "best-guess business or project name from their context",
  "thesis": "one-paragraph why this could compound 100x",
  "tam": "tight market sizing read (with rough numbers)",
  "wedge": "their unfair advantage / specific wedge into the market",
  "gtm": "first 3 distribution moves in order",
  "milestones": [
    { "horizon": "90 days", "what": "...", "signal": "metric they should hit" },
    { "horizon": "6 months", "what": "...", "signal": "..." },
    { "horizon": "18 months", "what": "...", "signal": "..." }
  ],
  "exit_paths": ["acquirer category 1", "acquirer category 2", "IPO threshold"]
}`;

    case "images":
      return `You're writing IMAGE GENERATION PROMPTS for ${name} — viral-style portraits built from their real context. The user will paste these into Midjourney / ChatGPT-image / etc.

Return JSON ONLY:
{
  "intro": "one-sentence read on their aesthetic / archetype",
  "prompts": [
    { "title": "scene name", "prompt": "full image-gen prompt, 1-2 sentences, includes setting / wardrobe / mood / aspect ratio" }
  ]
}

5 prompts. Each prompt must reference SOMETHING specific from their context (an industry, a city, a role, a project name). No generic prompts.`;

    case "song":
      return `You're writing ${name}'s PERSONAL SONG concept — title + genre + tempo + lyrics outline drawn from their real story arc.

Return JSON ONLY:
{
  "title": "song title",
  "genre": "primary genre + secondary influence",
  "tempo_bpm": 95,
  "tonality": "one-line read on the vibe",
  "verse_1": "actual lyrics, 4 lines",
  "chorus": "actual chorus lyrics, 4 lines",
  "verse_2": "lyrics, 4 lines",
  "bridge": "lyrics, 2-4 lines",
  "story_arc": "one paragraph on what the song is about"
}

Lyrics should reference their actual journey — places, work, people, recurring themes from their context.`;

    case "merch":
      return `You're designing a 5-piece MERCH LINE for ${name} based on their twin context. Each piece carries a phrase / mark that THEIR community would actually wear.

Return JSON ONLY:
{
  "line_name": "name of the merch line",
  "tagline": "one-line tagline",
  "pieces": [
    { "type": "t-shirt | hoodie | cap | sticker | tote", "name": "design name", "front": "what's on the front (text + visual description)", "back": "what's on the back, or 'none'", "color": "primary color", "audience": "who buys this" }
  ]
}

5 pieces. Names + slogans must be specific to their world, not generic startup energy.`;
  }
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const kind = (body.kind ?? "") as Kind;
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }, { data: exports }] = await Promise.all([
    service
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("twin_profiles")
      .select("goals, deal_preferences, communication_style, ai_export_blob")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("ai_exports")
      .select("source, content")
      .eq("user_id", user.id)
  ]);

  const name =
    (profile as any)?.display_name ||
    (profile as any)?.email?.split("@")[0] ||
    "the user";

  const context = [
    `Goals: ${(twin as any)?.goals || "(none)"}`,
    `Deal preferences: ${(twin as any)?.deal_preferences || "(none)"}`,
    `Comm style: ${(twin as any)?.communication_style || "(none)"}`,
    (twin as any)?.ai_export_blob
      ? `\nBio:\n${(twin as any).ai_export_blob.slice(0, 4000)}`
      : "",
    ...((exports ?? []) as any[]).map(
      (e) => `\nFrom ${e.source}:\n${(e.content || "").slice(0, 3000)}`
    )
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = promptFor(kind, name);
  const userContent = `${context}\n\nNow produce the JSON for ${name}.`;

  try {
    const response = await withAnthropicRetry(
      () =>
        anthropic.messages.create({
          model: TWIN_MODEL,
          max_tokens: 2500,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }]
        }),
      { label: `pi-${kind}` }
    );
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("no_json_found");
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json({ kind, payload: parsed });
  } catch (e: any) {
    console.error(`[pi/${kind}] gen failed`, e);
    const friendly =
      e instanceof FriendlyAnthropicError
        ? e.message
        : e?.message ?? String(e);
    return NextResponse.json(
      { error: "generation_failed", detail: friendly },
      { status: 500 }
    );
  }
}
