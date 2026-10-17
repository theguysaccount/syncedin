import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Generate (or regenerate) a fully custom AI portfolio page for the
 * signed-in user. Replaces the cookie-cutter stack of identical
 * sections at /u/[handle] with a structured long-form site shaped by
 * the user's own voice + content.
 *
 * Output JSON shape (saved to profiles.portfolio_page):
 *   {
 *     hero: {
 *       eyebrow: string,        // short label, e.g. "founder · dev tools"
 *       headline: string,       // one-line hook, distinctive
 *       sub: string,            // 1–2 sentence narrative kicker
 *       cta_label: string       // dynamic CTA the visitor sees, e.g.
 *                               // "let your twin pitch to mine →"
 *     },
 *     theme: {
 *       accent: string,         // hex color
 *       bg: string,             // css background (gradient or solid)
 *       vibe_emoji: string,     // single emoji
 *       vibe_label: string      // short ALL-CAPS vibe label, e.g.
 *                               // "WEEKEND-SCALE OPERATOR"
 *     },
 *     sections: [
 *       { title: string, body: string }
 *     ]                        // 4–7 sections, written in user's voice
 *   }
 *
 * Sections vary by user — a founder gets "What I'm building", "Why
 * now", "What I need", "What I can offer"; an investor gets "Thesis",
 * "Recent checks", "What I look for"; an artist gets a different
 * shape entirely. Claude picks the section taxonomy based on the
 * content.
 */
export async function POST() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }] = await Promise.all([
    service
      .from("profiles")
      .select("display_name, email, avatar_url, handle, portfolio_about")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("twin_profiles")
      .select(
        "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city, achievements"
      )
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  const name =
    (profile as any)?.display_name ||
    (profile as any)?.email ||
    "this user";
  const t = (twin as any) ?? {};
  // Build the deepest possible context block we can hand Claude.
  // Everything goes in — the model decides what to surface.
  const contextBlock = [
    `Name: ${name}`,
    (profile as any)?.portfolio_about &&
      `Existing about (use as voice reference, not as a quote):\n${(profile as any).portfolio_about}`,
    t.current_city && `Current city: ${t.current_city}`,
    t.hometown && `Hometown: ${t.hometown}`,
    t.goals && `Goals:\n${t.goals}`,
    t.deal_preferences && `What they offer / deal prefs:\n${t.deal_preferences}`,
    t.deal_breakers && `Deal breakers:\n${t.deal_breakers}`,
    t.communication_style &&
      `Communication style:\n${t.communication_style}`,
    t.achievements && `Achievements:\n${t.achievements}`,
    t.ai_export_blob &&
      `Deep self-export blob (their own voice + scraped context):\n${(t.ai_export_blob as string).slice(0, 12000)}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt = `You write distinctive, custom one-person landing pages for SyncedIn. Every page must feel like it was hand-crafted for that one specific person — NOT a cookie-cutter template.

Hard rules:
- Write in FIRST PERSON, in the user's own voice (cue off the context blob's tone — direct vs warm, hedged vs blunt, etc).
- Surface CONCRETE specifics from the context: real projects, companies, numbers, places, people they've worked with, things they've shipped. No corporate fluff, no "passionate about innovation," no marketing speak.
- The section taxonomy MUST adapt to who this person is. A founder gets different sections than an investor. An artist gets different sections than an operator. Don't force every page into the same 4-section mold.
- 4–7 sections total. Each section has a TITLE and a BODY (1–4 paragraphs of prose, or a punchy bulleted list — use whichever serves the content). Bodies should average 80–200 words.
- Hero copy must be DISTINCTIVE. The headline should be a sentence a stranger would screenshot. The eyebrow is a short identity label. The sub is the "why you should care" kicker.
- Pick a theme that matches the vibe: builders → electric blue/violet, finance/serious → muted grayscale or deep green, artists → high-contrast colors, etc. accent should be a hex color, bg can be a CSS gradient (linear-gradient(...)) or a flat hex.
- The CTA label should be dynamic — for an investor it might be "send my twin your deck →", for an operator "have your twin pitch me →", for a writer "my twin will read your draft →". Match the function this person serves.
- NEVER reference SyncedIn explicitly inside the content (the platform chrome already does that).
- Output ONLY valid JSON matching this exact shape, no commentary, no markdown fences:

{
  "hero": {
    "eyebrow": "...",
    "headline": "...",
    "sub": "...",
    "cta_label": "..."
  },
  "theme": {
    "accent": "#...",
    "bg": "...",
    "vibe_emoji": "...",
    "vibe_label": "..."
  },
  "sections": [
    { "title": "...", "body": "..." }
  ]
}`;

  let parsed: any = null;
  try {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: contextBlock }]
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("Model didn't return JSON.");
    }
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: e?.message ?? String(e)
      },
      { status: 500 }
    );
  }

  // Light schema validation — fail loud if Claude returned junk so
  // the editor can show the error instead of writing a broken page.
  if (
    !parsed ||
    !parsed.hero ||
    typeof parsed.hero.headline !== "string" ||
    !Array.isArray(parsed.sections) ||
    parsed.sections.length === 0
  ) {
    return NextResponse.json(
      {
        error: "bad_shape",
        detail: "Generation succeeded but the response was missing required fields. Try again."
      },
      { status: 500 }
    );
  }

  // Persist. Wrapped in try so a missing column doesn't crash — we
  // surface a friendly migration message.
  const { error } = await service
    .from("profiles")
    .update({
      portfolio_page: parsed,
      portfolio_page_generated_at: new Date().toISOString()
    })
    .eq("id", user.id);
  if (error) {
    if (/portfolio_page|column|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Run this SQL in Supabase → SQL Editor first, then click regenerate again:\n\nalter table public.profiles add column if not exists portfolio_page jsonb;\nalter table public.profiles add column if not exists portfolio_page_generated_at timestamptz;"
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    page: parsed
  });
}
