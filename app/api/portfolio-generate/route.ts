import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Portfolio generator. Takes EVERYTHING about the user (twin_profiles,
 * ai_export_blob, portfolio_about, recent conversation summaries, recs)
 * and asks Claude to design a rich multi-section custom site. Returns
 * structured JSON that `app/u/[handle]/CustomSite.tsx` renders.
 *
 * Why JSON instead of HTML: we need server-side typing + sanitization,
 * and the renderer can evolve (animations, layout tweaks, theme rules)
 * without re-running the LLM. JSON also lets us swap section ORDER
 * without regenerating content.
 *
 * Jack: "Portfolio page is still the same trash its always been not
 * a custom awesome website... do we need to use subdomains for them
 * to be truly custom?" Answer: no, what's missing is generated CONTENT
 * variety. This route generates that.
 */

// Tight JSON schema we ask Claude to produce. Keep it permissive
// enough that the model can be expressive but tight enough that we
// can safely render without escaping issues.
type Section =
  | { kind: "hero"; layout: "split" | "centered" | "magazine"; headline: string; subhead: string; tagline: string }
  | { kind: "story"; layout: "prose" | "timeline"; title: string; paragraphs: string[] }
  | { kind: "projects"; layout: "grid" | "list"; title: string; items: Array<{ name: string; line: string }> }
  | { kind: "wins"; layout: "stat-row" | "list"; title: string; items: Array<{ label: string; value: string }> }
  | { kind: "seeking"; layout: "callout" | "bullets"; title: string; body: string; bullets?: string[] }
  | { kind: "values"; layout: "cards" | "list"; title: string; items: Array<{ label: string; body: string }> }
  | { kind: "quote"; layout: "pull"; quote: string; attribution?: string }
  | { kind: "contact"; layout: "cta"; title: string; body: string; cta_label: string };

type PortfolioPage = {
  accent_color: string; // hex
  bg_gradient: string;  // CSS gradient
  vibe_tag: string;     // 1-3 words
  font_pair: { display: string; body: string };
  sections: Section[];
  generated_at: string;
  generator_version: number;
};

const GENERATOR_VERSION = 1;

function fallback(name: string, about: string | null): PortfolioPage {
  return {
    accent_color: "#1f59ff",
    bg_gradient: "linear-gradient(180deg, #f4f3ff 0%, #ffffff 60%)",
    vibe_tag: "founder",
    font_pair: { display: "Inter", body: "Inter" },
    sections: [
      {
        kind: "hero",
        layout: "centered",
        headline: name,
        subhead: about?.slice(0, 160) || "Building things on SyncedIn.",
        tagline: ""
      }
    ],
    generated_at: new Date().toISOString(),
    generator_version: GENERATOR_VERSION
  };
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const force = !!body?.force; // owner clicked "regenerate"
  // Optional user-supplied extra direction. Jack: "on the regenerate
  // for portfolio page lets expose the prompt and let someone edit."
  // Appended to the system prompt as high-weight guidance so Claude
  // honors it ("lead with my Brazil chapter", "dark mode", "no
  // projects section", etc).
  const extraInstructions: string =
    typeof body?.extra_instructions === "string"
      ? body.extra_instructions.slice(0, 1200).trim()
      : "";

  const service = createServiceClient();

  // Pull EVERYTHING. Separate selects so a missing optional column on
  // a given DB doesn't take the route down.
  const { data: profile } = await service
    .from("profiles")
    .select("id, display_name, email, avatar_url, handle")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "no_profile" }, { status: 404 });
  }

  let portfolio_about: string | null = null;
  let portfolio_page_existing: PortfolioPage | null = null;
  try {
    const { data: opt } = await service
      .from("profiles")
      .select("portfolio_about, portfolio_page")
      .eq("id", user.id)
      .maybeSingle();
    portfolio_about = ((opt as any)?.portfolio_about as string) ?? null;
    portfolio_page_existing =
      ((opt as any)?.portfolio_page as PortfolioPage) ?? null;
  } catch {
    /* columns may not be migrated */
  }

  // Idempotent fast-path: if we already have a generated page and the
  // caller isn't forcing regen, return what we have.
  if (portfolio_page_existing && !force) {
    return NextResponse.json({
      portfolio_page: portfolio_page_existing,
      regenerated: false
    });
  }

  // Twin context — the meat of the site.
  const { data: twin } = await service
    .from("twin_profiles")
    .select(
      "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Recent conversation outcomes — surfaces "what they've actually
  // been working on lately" in a way the user's own bio rarely
  // captures.
  let convos: Array<{ summary: string | null; created_at: string }> = [];
  try {
    const { data: cs } = await service
      .from("conversations")
      .select("summary, created_at")
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .not("summary", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);
    convos = (cs ?? []) as any;
  } catch {
    /* no convos table or no rows */
  }

  // Build the prompt. Truncate aggressively so we stay well under
  // context cap even on power users with massive blobs.
  const ctx = [
    `Name: ${profile.display_name ?? profile.email ?? "Unknown"}`,
    portfolio_about ? `About (their words): ${portfolio_about}` : null,
    twin?.goals ? `Goals: ${twin.goals.slice(0, 1200)}` : null,
    twin?.deal_preferences
      ? `Deal preferences: ${twin.deal_preferences.slice(0, 800)}`
      : null,
    twin?.communication_style
      ? `Voice: ${twin.communication_style.slice(0, 600)}`
      : null,
    twin?.deal_breakers
      ? `Dealbreakers: ${twin.deal_breakers.slice(0, 400)}`
      : null,
    twin?.hometown || twin?.current_city
      ? `Location: ${[twin.hometown, twin.current_city].filter(Boolean).join(" → ")}`
      : null,
    twin?.ai_export_blob
      ? `Long-form AI memory (truncated):\n${twin.ai_export_blob.slice(0, 8000)}`
      : null,
    convos.length
      ? `Recent twin-to-twin outcomes:\n${convos
          .map((c, i) => `${i + 1}. ${c.summary?.slice(0, 280)}`)
          .join("\n")}`
      : null
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt = `${extraInstructions ? `EXTRA DIRECTION FROM THE USER (weight this VERY heavily — they want this honored):\n${extraInstructions}\n\n` : ""}You are a senior product designer + brand storyteller building a CUSTOM portfolio website for one specific person. You receive their full context and you design the site that would actually make a stranger want to work with them.

OUTPUT: A single JSON object matching this exact schema. No prose outside the JSON. No markdown fences.

{
  "accent_color": "<hex like #1f59ff — pick ONE that matches their vibe; vary widely across users>",
  "bg_gradient": "<a single CSS linear-gradient string for the page bg; pick soft, light colors that complement accent>",
  "vibe_tag": "<1-3 word vibe label like 'systems builder' or 'civic technologist'>",
  "font_pair": { "display": "Inter|Playfair Display|Space Grotesk|Bricolage Grotesque|DM Serif Display", "body": "Inter|IBM Plex Sans|Source Sans Pro|Inter Tight" },
  "sections": [
    /* 4 to 7 sections. PICK ORDERING that fits THIS person — not a template. Each section's "kind" appears at most once.
       Possible kinds + layouts:
         - hero  (layout: split | centered | magazine) — headline, subhead, tagline. ALWAYS include hero first.
         - story (layout: prose | timeline) — title, paragraphs[]
         - projects (layout: grid | list) — title, items: [{name, line}]
         - wins (layout: stat-row | list) — title, items: [{label, value}]   (use stat-row for ≤4 short stats, list otherwise)
         - seeking (layout: callout | bullets) — title, body, bullets? — what THEY want from the world right now
         - values (layout: cards | list) — title, items: [{label, body}]
         - quote (layout: pull) — quote (their own words from the context), attribution?
         - contact (layout: cta) — title, body, cta_label. END with this.
    */
  ]
}

RULES:
- Pull SPECIFIC details from the context. No "passionate professional", no "lifelong learner", no MBA-speak. If they have specific projects, name them. If they have specific cities, name them. Use their own words where they have voice.
- Vary section ordering, layout choices, and accent color WIDELY across different users. Two users with similar bios should still get visibly different sites.
- Keep section count between 4 and 7. Always include hero first and contact last.
- The "quote" kind, when used, must quote their OWN words from the context. Never invent quotes.
- Output must be valid JSON, ready for JSON.parse.`;

  const userPrompt = `Design the custom portfolio site for this person:

${ctx}

Return only the JSON.`;

  let generated: PortfolioPage | null = null;
  try {
    const completion = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    });
    const text = (completion.content as any[])
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("");
    // Best-effort JSON extraction — strip code fences if Claude added any
    // despite the instruction.
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("no_json");
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    parsed.generated_at = new Date().toISOString();
    parsed.generator_version = GENERATOR_VERSION;
    generated = parsed as PortfolioPage;
  } catch (e: any) {
    // Degrade gracefully so the page never breaks — save the fallback
    // so the renderer still has something fresh.
    generated = fallback(
      profile.display_name ?? profile.email ?? "Friend",
      portfolio_about
    );
  }

  // Persist. If the column doesn't exist on this DB, return the
  // generated page anyway so the client can render it transiently.
  try {
    await service
      .from("profiles")
      .update({ portfolio_page: generated })
      .eq("id", user.id);
  } catch {
    /* schema may lag — that's OK */
  }

  return NextResponse.json({
    portfolio_page: generated,
    regenerated: force
  });
}
