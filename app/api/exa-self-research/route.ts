import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { exaPeopleSearch } from "@/lib/exa";

/**
 * Exa-powered self-dossier for onboarding.
 *
 * Two modes:
 *  1. Candidates (no confirmed_url) — return the top N people Exa found that
 *     match the user's name. User picks "that's me".
 *  2. Synthesis (confirmed_url given) — given the picked person's bio, ask
 *     Claude to convert the raw scrape into a clean first-person dossier
 *     the user can edit and use as their twin context.
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
    hints?: string;
    confirmed_url?: string;
    confirmed_title?: string;
    confirmed_highlights?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  // ── MODE 2: synthesize a dossier from a confirmed match ───────────────
  if (body.confirmed_url && body.confirmed_highlights?.length) {
    const highlights = body.confirmed_highlights.join("\n");
    const system = `You convert raw web scrapes about a person into a clean, first-person dossier they can use to onboard a digital twin. Write in plain prose, no markdown, no headers, no bullets, no em-dashes. Speak AS THE PERSON in first person ("I am...", "I work on...", "My focus is..."). Cover what's known: role, company, location, focus areas, skills, what they build or ship, anything that would help a twin negotiate on their behalf. If something is uncertain, omit it instead of guessing. 250-400 words.`;
    const userPrompt = `Convert this scrape about ${name} into a first-person dossier.

Raw scrape:
${highlights}

Return only the dossier text.`;
    try {
      const r = await anthropic.messages.create({
        model: TWIN_MODEL,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: userPrompt }]
      });
      const dossier = r.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .replace(/\s*[—–]\s*/g, ", ")
        .trim();
      return NextResponse.json({
        dossier,
        source_url: body.confirmed_url,
        source_title: body.confirmed_title ?? ""
      });
    } catch (e: any) {
      console.error("self-research synth error", e);
      return NextResponse.json(
        { error: "synth_failed", detail: e?.message ?? String(e) },
        { status: 500 }
      );
    }
  }

  // ── MODE 1: return candidates ─────────────────────────────────────────
  const query = body.hints ? `${name} ${body.hints}` : name;
  try {
    const candidates = await exaPeopleSearch(query, 6);
    return NextResponse.json({ candidates });
  } catch (e: any) {
    console.error("self-research search error", e);
    return NextResponse.json(
      { error: "search_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
