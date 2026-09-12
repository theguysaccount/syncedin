import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { exaGetContents } from "@/lib/exa";
import type { Profile, TwinProfile } from "@/lib/types";
import { buildOutreachContext, capConnectionNote, parseOutreachContext, type OutreachExample } from "@/lib/outreach-context";

/**
 * The current user's twin drafts a short, personalized reach-out to a person
 * Exa surfaced. ALSO:
 *  - Generates a unique slug (e.g. "lucas-chu")
 *  - Generates an opening conversation message from the user's twin
 *  - Stores both in pending_invites so the invitee can land at
 *    syncedin.org/<slug>, see the auto-started conversation, and sign up to
 *    reply with their own twin
 *  - Appends the personal invite URL to the outreach message
 *
 * Hard rules in the outreach prose:
 *  - No em-dashes (—) anywhere
 *  - Be specific about WHY they're a fit, drawn from the highlights
 *  - Mention the platform suggested the match and an auto-generated convo
 *    waits at the link
 */

// Slugify a person's name: take first 2-3 words before any separator,
// lowercase, alphanumeric + hyphens only.
function slugify(name: string): string {
  const firstChunk = name.split(/[-|,(·]/)[0] || name;
  const base = firstChunk
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "twin";
}

// Strip em-dashes and en-dashes from generated text (defense in depth on top
// of the prompt instruction).
function stripDashes(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .trim();
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const outreachContext = parseOutreachContext(body);
  if (body.mode !== undefined && body.mode !== "connection_note" && body.mode !== "invite") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }
  const personTitle = outreachContext.person_title;
  if (!personTitle) {
    return NextResponse.json({ error: "missing_person" }, { status: 400 });
  }
  const personUrl = outreachContext.person_url;
  const suppliedHighlights = Array.isArray(body.highlights)
    ? body.highlights.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 3000))
    : [];

  // Fetch FULL Exa contents for this URL so the LLM gets the whole profile,
  // not just 4-sentence highlights. Falls back to the highlights if the
  // contents API fails or returns nothing.
  let fullBody = "";
  if (personUrl) {
    try {
      fullBody = await exaGetContents(personUrl);
    } catch (e) {
      console.error("exa-getcontents failed, falling back to highlights", e);
    }
  }
  const rawHighlights = suppliedHighlights.join("\n");
  const highlights = (fullBody || rawHighlights || "").slice(0, 6000);

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }, { data: examples, error: examplesError }] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id).single(),
    service
      .from("twin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("outreach_examples")
      .select("person_title,person_url,person_background,search_query,connection_reason,original_draft,edited_text")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30)
  ]);
  if (examplesError) console.error("outreach examples unavailable", examplesError);
  const contextPrompt = buildOutreachContext(outreachContext, (examples || []) as OutreachExample[]);

  const p = profile as Profile;
  const t = twin as TwinProfile | null;
  const selfName = p?.display_name || p?.email || "the sender";

  // Discover only needs a connection note, not a landing page or a long DM.
  const shortSystemPrompt = `You are the digital twin of ${selfName}, writing a LinkedIn connection-request note to someone you don't know yet.

# Who you are representing
Name: ${selfName}
Goals: ${t?.goals || "(not specified)"}
Communication style: ${t?.communication_style || "(default: warm, concise, direct)"}

${contextPrompt}

# Who you're reaching out to
${personTitle}
What's known about them: ${highlights || "(only the name/role above)"}

# Hard rules
- MAX 300 CHARACTERS, including spaces and punctuation. Count them.
- 1 to 3 short sentences.
- NO em-dashes or en-dashes. NO markdown. NO subject line, NO signature.
- Open with ONE specific reason ${selfName} wants to connect, drawn from what's known about them. NEVER mention follower count, connection count, or audience size.
- HEDGE inferred claims about their role / employer / focus. If you reference where they work or what they build, use "correct me if I'm wrong" / "looks like" / "if I'm reading this right". A scrape can be stale; a wrong assumption in the first message burns trust.
- Make the ask intentional: use the current connection_reason when given. Otherwise use relevant approved examples and the sender's goals. Do not force a SyncedIn pitch or promise an invite link when the purpose is a different conversation, introduction, event, or collaboration.
- Close with a small, natural next step that matches that purpose. Match relevant approved notes instead of repeating a stock closing.
- First person, plain text. Do NOT include a URL (LinkedIn flags notes containing URLs as spam).`;

  async function generateShortNote() {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 300,
      system: shortSystemPrompt,
      messages: [{ role: "user", content: "Write only the connection-request note. Maximum 300 characters. No URL or follower count mention. Prioritize the stated connection reason and learn from approved notes only when the audience and purpose match." }]
    });
    const note = capConnectionNote(response.content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join(" "));
    if (!note) throw new Error("No connection note returned. Please try again.");
    return note;
  }

  if (body.mode === "connection_note") {
    try {
      return NextResponse.json({ short_message: await generateShortNote(), person_background: highlights });
    } catch (error) {
      console.error("connection note generation failed", error);
      return NextResponse.json({ error: "Could not draft a connection note. Please try again." }, { status: 502 });
    }
  }

  // Unique slug for the landing page. If taken, append a short hash.
  const baseSlug = slugify(personTitle);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await service
      .from("pending_invites")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";
  const inviteUrl = `${appUrl}/${slug}`;

  const longSystemPrompt = `You are the digital twin of ${selfName}, writing a first outreach message to invite someone to connect on SyncedIn (an agent-to-agent protocol where two people's digital twins explore the highest-leverage win-win between them).

# Who you are representing
Name: ${selfName}
Goals: ${t?.goals || "(not specified)"}
Deal preferences: ${t?.deal_preferences || "(not specified)"}
Communication style: ${t?.communication_style || "(default: warm, concise, direct)"}

${contextPrompt}

# Who you're reaching out to
${personTitle}
${personUrl ? `Profile: ${personUrl}` : ""}
What's known about them:
${highlights || "(only the name/role above)"}

# Personal invite link for this exact person
${inviteUrl}
(A conversation has already been auto-generated there from ${selfName}'s twin; they just need to sign up to reply with their own.)

# Hard rules — do not break these
- 3 to 5 short sentences. No long monologue.
- DO NOT use em-dashes or en-dashes anywhere. Use commas, periods, or colons instead.
- Be CONCRETE about why ${selfName} and this person are a fit. Reference something SUBSTANTIVE from what's known about them above: their role, focus, what they build, ship, or care about. Generic flattery is banned.
- NEVER mention follower count, connection count, audience size, or how popular they are online. That's low-signal noise.
- HEDGE EVERY INFERRED CLAIM. Anything you assert about the recipient's role, employer, current focus, or affiliations is derived from a scrape that may be stale or wrong. Soften with "correct me if I'm wrong" / "looks like" / "if I'm reading this right" / "from what I can tell". The worst outcome is confidently claiming someone works somewhere they don't. Tentative and accurate beats confident and wrong on first contact.
- Mention that the platform suggested the match, and that a conversation has already been auto-generated from your clone at the link. Phrase it like: the recipient can sign up and their clone can pair with yours to streamline the back-and-forth.
- Include the personal invite link above (raw URL, no markdown) somewhere natural in the message.
- First person, plain text. No subject line, no signature.
- Match ${selfName}'s communication style.`;

  let outreach = "";
  let shortNote = "";
  let convStarter = "";

  const convPrompt = `You are the digital twin of ${selfName}. Write the OPENING message of a real, personal conversation with ${personTitle}, who is about to land on a SyncedIn invite page from ${selfName}'s clone.

This is NOT the LinkedIn DM. This is the inside-the-platform opening message ${personTitle} sees only after they show up to the invite page. It should be MORE personal, MORE specific, and LONGER than the outreach DM, because the recipient has already clicked. The point is to hook them so deeply that they sign up to read the full message and have their own clone reply.

# What ${selfName} cares about
Goals: ${t?.goals || "(not specified)"}
Deal preferences: ${t?.deal_preferences || "(not specified)"}
Deal-breakers: ${t?.deal_breakers || "(not specified)"}
Communication style: ${t?.communication_style || "(default: warm, concise, direct)"}
Other context: ${(t?.ai_export_blob || "").slice(0, 3000)}

${contextPrompt}

# Full context on ${personTitle}
${highlights || "(only the name/role above)"}

# How to write the opening
- 6 to 9 sentences. Build a real argument, not a greeting.
- Speak in first person as ${selfName}, plain prose only.
- Open with the single most SPECIFIC observation about ${personTitle} drawn from the full context above. Quote a project, role, or signal verbatim if it earns the point. NEVER mention follower count, connection count, or audience size.
- In the middle, lay out the SPECIFIC overlap with ${selfName}'s goals. Be concrete: which initiative, which problem, which opportunity.
- Surface ONE non-obvious mutual win you see between them, the kind only an AI that read both contexts would catch.
- Close with a real question that demands a reply, not a soft invite.
- NO em-dashes or en-dashes anywhere. NO markdown. NO headers, no bullets. Just paragraphs of prose.`;

  try {
    // Generate all three in parallel — long DM, 300-char connection note,
    // and the landing-page opening conversation message.
    const [r1, r2, r3] = await Promise.all([
      anthropic.messages.create({
        model: TWIN_MODEL,
        max_tokens: 600,
        system: longSystemPrompt,
        messages: [
          {
            role: "user",
            content: `Write the outreach message to ${personTitle}. Remember: no em-dashes, be specific about why they're a fit, include the invite link, mention the auto-generated conversation, never mention follower count.`
          }
        ]
      }),
      generateShortNote(),
      anthropic.messages.create({
        model: TWIN_MODEL,
        max_tokens: 900,
        system: convPrompt,
        messages: [
          {
            role: "user",
            content: `Write the opening conversation message. Use the FULL context above. 6 to 9 sentences. Make it the most specific, personal opening you can — the recipient has already shown up, your job is to convince them this is worth signing up for.`
          }
        ]
      })
    ]);

    outreach = r1.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    outreach = stripDashes(outreach);
    if (!outreach.includes(inviteUrl)) {
      outreach = `${outreach}\n\n${inviteUrl}`;
    }

    shortNote = r2;

    convStarter = r3.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    convStarter = stripDashes(convStarter);
  } catch (e: any) {
    console.error("exa-draft-outreach generation error", e);
    return NextResponse.json(
      { error: "draft_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }

  // Save the pending invite so the landing page can render it.
  // Tag with a variant so the scoreboard can compare per-prompt CTR.
  // v5 adds explicit outreach purpose and contextual learning from approved notes.
  const messageVariant = "v5-discover-contextual";
  const { error: insertErr } = await service.from("pending_invites").insert({
    slug,
    inviter_user_id: user.id,
    person_title: personTitle,
    person_url: personUrl || null,
    person_highlights: suppliedHighlights,
    conversation_starter: convStarter,
    outbound_message: outreach,
    message_variant: messageVariant
  });
  if (insertErr) {
    console.error("pending_invites insert failed", insertErr);
    return NextResponse.json({ error: "The invite page could not be saved. Please try again." }, { status: 503 });
  }

  return NextResponse.json({
    message: outreach,
    short_message: shortNote,
    person_background: highlights,
    slug,
    invite_url: inviteUrl,
    conversation_starter: convStarter
  });
}
