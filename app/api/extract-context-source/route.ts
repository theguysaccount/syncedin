import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { scrapePublicProfile } from "@/lib/scrape";

/**
 * Universal context-source ingestion for onboarding.
 *
 * Body shape:
 *  - { type: "url", value: "https://linkedin.com/in/..." }  any web page
 *  - { type: "raw", value: "...pasted text..." }            free paste
 *
 * Returns:
 *   { label, source, extracted_text }
 *
 * The extracted_text is a SHORT, first-person dossier rewrite ready to be
 * appended to the user's twin context. Anthropic also cleans noise like
 * navbar text, ads, and follower counts.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { type?: string; value?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = (body.type ?? "url").toLowerCase();
  const value = (body.value ?? "").trim();
  const userNote = (body.note ?? "").trim().slice(0, 1500);
  if (!value && !userNote) {
    return NextResponse.json({ error: "missing_value" }, { status: 400 });
  }

  // 1. Get the raw text we'll feed Claude.
  let rawText = "";
  let label = "";
  let source = value;

  try {
    if (type === "raw") {
      rawText = value.slice(0, 20000);
      label = "Pasted text";
      source = "manual";
    } else {
      // Anything else is treated as a URL. scrapePublicProfile tries Exa
      // first and falls back to Apify for X / Instagram which Exa can't
      // reach. If neither works the user can still paste the text below.
      rawText = await scrapePublicProfile(value);
      label = guessLabel(value);
      source = value;
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "fetch_failed",
        detail: e?.message ?? "Couldn't reach that source. Try pasting the text directly."
      },
      { status: 502 }
    );
  }

  // ANY TEXT IS THE VOICE.
  //
  // We used to gate this on a Claude rewrite step that would sometimes
  // decline ("no usable content") and surface a hard error. That was
  // over-engineering — even a sparse scrape (bio + handle + a few posts)
  // is real signal. Just save whatever the scraper returned.
  //
  // For social URLs (X / LinkedIn / Instagram), the raw scrape IS the voice
  // sample — preserved verbatim so the twin learns actual phrasing.
  //
  // For "Any URL" we still pass through Claude to convert third-person
  // about-me copy into first-person ("I work on…"), since that's the only
  // case where a rewrite is genuinely useful. If the LLM call fails for
  // any reason, we fall back to the raw scrape rather than 500ing.
  const sourceLower = source.toLowerCase();
  const isSocial =
    type === "raw" ||
    /linkedin\.com|twitter\.com|x\.com|instagram\.com/.test(sourceLower);

  let cleaned = rawText.slice(0, 20000);

  if (!isSocial && rawText.trim().length > 0) {
    try {
      const r = await anthropic.messages.create({
        model: TWIN_MODEL,
        max_tokens: 600,
        system: `You convert a raw web scrape ABOUT a person into a short, first-person snippet they can use as twin context.

Rules:
- First person ("I", "my", "I work on..."), present tense.
- Plain prose, no markdown, no bullets, no headers, no em-dashes.
- 80 to 180 words. Cover what's known: role, focus, what they build or care about, signals about voice and values.
- Skip filler: ads, navigation text, follower counts, audience sizes, button labels, repeated brand mentions.
- If the scrape is sparse, return only what's supported by the text. Never invent details.
- If the scrape is unusable, return the cleaned raw text anyway — do NOT respond with "no usable content" or similar.`,
        messages: [
          {
            role: "user",
            content: `Source: ${source}\n\nRaw scrape:\n${rawText.slice(0, 12000)}\n\nReturn just the cleaned first-person snippet.`
          }
        ]
      });
      const candidate = r.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .replace(/\s*[—–]\s*/g, ", ")
        .trim();
      // Guard against the LLM dropping a refusal — if it refused, keep the raw.
      if (
        candidate &&
        !/no usable|nothing to extract|cannot extract|i can(?:'|')t/i.test(
          candidate
        )
      ) {
        cleaned = candidate;
      }
    } catch (e) {
      console.warn("[extract] LLM rewrite failed, using raw scrape", e);
      // cleaned stays as rawText
    }
  }

  return NextResponse.json({
    label,
    source,
    extracted_text: cleaned,
    raw_chars: rawText.length
  });
}

function guessLabel(url: string): string {
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/(twitter|x)\.com/i.test(url)) return "X / Twitter";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/github\.com/i.test(url)) return "GitHub";
  if (/medium\.com|substack\.com/i.test(url)) return "Article";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}
