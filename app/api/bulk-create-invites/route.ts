import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { scrapePublicProfile } from "@/lib/scrape";
import { extractProfileName } from "@/lib/profile-name";
import type { Profile, TwinProfile } from "@/lib/types";

/**
 * Mass-generate personalized invite landing pages for a list of contacts.
 *
 * Body shape:
 *   { contacts: [{ name?, email?, handle?, note? }, ...] }
 *
 * For each, we:
 *   - Slugify their name (or email local-part, or handle)
 *   - Ensure slug uniqueness (append a random suffix on collision)
 *   - Generate ONE quick conversation-starter via Claude that includes the
 *     person's name. We use a single batched call for all contacts to keep
 *     it fast and cheap.
 *   - Insert into pending_invites
 *
 * Returns: { results: [{ contact, slug, url, starter }, ...] }
 */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  // Split on common separators, capitalize each word.
  return local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

type Contact = {
  name?: string;
  email?: string;
  phone?: string;
  handle?: string;
  note?: string;
  /** LinkedIn / X / Instagram / Facebook profile URL — scraped to
   *  personalize the conversation_starter. */
  profile_url?: string;
};

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { contacts?: Contact[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawContacts = (body.contacts ?? []).slice(0, 100);
  // Normalize: derive a name for each
  function nameFromProfileUrl(url: string): string {
    try {
      const u = new URL(url);
      const seg = u.pathname
        .split("/")
        .filter(Boolean)
        .filter((s) => s !== "in")
        .pop();
      if (!seg) return "";
      // LinkedIn often appends a 6-10 char alphanumeric ID suffix to
      // its /in/<handle> slug when the basename collides — e.g.
      // /in/nick-linck-417b0ba. The old regex `\d+$` only stripped pure
      // trailing digits, so "417b0ba" survived and "Nick Linck 417B0Ba"
      // ended up on the invite card. Strip ANY trailing dash-separated
      // segment that mixes letters and digits (a name part never does).
      let cleaned = seg
        .replace(/-+[a-z0-9]*\d[a-z0-9]*$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\d+$/, "")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      // Belt-and-suspenders — after capitalization, drop any word that
      // still has a digit (handles cases where the ID wasn't dash-
      // delimited or the LinkedIn URL had unusual structure).
      cleaned = cleaned
        .split(/\s+/)
        .filter((w) => !/\d/.test(w))
        .join(" ")
        .trim();
      return cleaned;
    } catch {
      return "";
    }
  }
  const contacts = rawContacts
    .map((c) => {
      const name =
        (c.name && c.name.trim()) ||
        (c.email && nameFromEmail(c.email)) ||
        (c.handle && c.handle.replace(/^@/, "")) ||
        (c.profile_url && nameFromProfileUrl(c.profile_url)) ||
        "";
      return { ...c, name };
    })
    .filter((c) => c.name);

  // For any contact with a profile_url, scrape it (parallel). The scrape
  // becomes part of the personalization context fed to Claude when writing
  // the opener for THAT specific person — AND we now extract the real full
  // name from the scrape and rewrite the contact's name in place, so the
  // landing page says "Ryaan Aqid" instead of "Ryaanaqid" (the URL slug).
  //
  const scrapes: Record<string, string> = {};
  await Promise.all(
    contacts.map(async (c) => {
      if (!c.profile_url) return;
      try {
        const text = await scrapePublicProfile(c.profile_url);
        // Used to gate at 60 chars — that threw away sparse-but-real profiles
        // (private accounts, low-post handles) which is exactly when the
        // opener needs the scrape most. Anything non-trivial is worth
        // feeding to Claude.
        if (text && text.trim().length > 15) {
          // Lifted 2000 → 12000. Deep LinkedIn scrape (premium=true)
          // returns the full profile dossier — experience descriptions,
          // recent posts, certifications, awards — which can run
          // ~6–10k chars. Cutting at 2000 was throwing away the
          // signal the opener needs most. Jack: "scrape isn't deep
          // enough" + "hard cutoff of 600 characters."
          scrapes[c.name] = text.slice(0, 12000);
          // Promote the scraped real name to the canonical name so the slug,
          // OG title, and opener all use it. Move the scrape entry under the
          // new key too.
          const real = extractProfileName(text);
          if (real && real.toLowerCase() !== c.name.toLowerCase()) {
            scrapes[real] = scrapes[c.name];
            delete scrapes[c.name];
            console.log(
              `[bulk-invite] promoted name "${c.name}" → "${real}" from scrape`
            );
            c.name = real;
          }
          console.log(
            `[bulk-invite] scrape ok for ${c.name}: ${text.length} chars`
          );
        } else {
          console.warn(
            `[bulk-invite] scrape empty for ${c.name} (${c.profile_url}): ${
              text ? text.length : 0
            } chars`
          );
        }
      } catch (e) {
        // Non-fatal — opener falls back to name-only personalization.
        console.warn("[bulk-invite] scrape failed", c.profile_url, e);
      }
    })
  );

  if (contacts.length === 0) {
    return NextResponse.json({ error: "no_contacts" }, { status: 400 });
  }

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id).single(),
    service
      .from("twin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);
  const p = profile as Profile;
  const t = twin as TwinProfile | null;
  const selfName = p?.display_name || p?.email || "the sender";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  // Batched conversation-starter generation: one Claude call, returns JSON
  // map of {name → 3-sentence opener}.
  let starters: Record<string, string> = {};
  // Short personalized OUTBOUND DMs (the message the sender copies + sends),
  // distinct from the longer landing opener. Jack: "make them a little
  // custom — not the same thing that's there when you click the link."
  let outbounds: Record<string, string> = {};
  try {
    // PROMPT v2 — RECIPIENT-FIRST.
    //
    // The previous version produced openers like "Hey X, this is ${selfName}'s
    // twin kicking off — ${selfName} would be thrilled if his twin could
    // carry it forward — ${selfName} is looking for…" which is 100% about
    // the sender. Jack flagged this: the recipient should always come
    // first. Real cold-outreach that converts opens with something
    // specific about THEM, then segues to the bridge / proposed value.
    //
    // New structure (hard-enforced via the system prompt):
    //   Sentence 1: about the RECIPIENT — reference a real detail from
    //     their scraped profile, or if no scrape, acknowledge their work
    //     by name in a way that doesn't pretend.
    //   Sentence 2: the bridge — what overlap / win-win exists between
    //     them and ${selfName}.
    //   Sentence 3: a real question that invites their reply.
    const system = `You write SHORT cold-outreach openers from ${selfName}'s digital twin to multiple named recipients. The non-negotiable rule: every opener must LEAD with something specific about the recipient, NOT about ${selfName}. And the angle of the win-win must MATCH the recipient's professional capacity, not blindly pitch ${selfName}'s headline goal at everyone.

CRITICAL — ROLE-AWARE FRAMING:
Before writing, identify the recipient's professional capacity from their Profile block. Then match the opener accordingly. NEVER reuse ${selfName}'s single headline pitch ("looking for leaders" / "raising a round" / "hiring") for every recipient — that's robot behavior and breaks trust instantly.

If the recipient is an INVESTOR / VC / angel:
  → Lead with one of ${selfName}'s ventures or projects that fits their thesis. Frame the win-win as "this is the kind of company you back" — NOT "come operate for me." Mention the specific fund / portfolio company they're known for if it's in the Profile.

If the recipient is a FOUNDER / CEO / operator in an aligned space:
  → Lead with the overlap of what they're building and what ${selfName} is building. Propose a collaboration, intro, or specific resource trade — NOT a job pitch.

If the recipient is a POTENTIAL HIRE / candidate (the "hungry leader" type):
  → Then and ONLY then lead with the "we have projects ready to hand off" angle. This is the narrowest framing, not the default.

If the recipient is a CUSTOMER / user / community member:
  → Lead with what ${selfName} is shipping that solves their stated problem.

If the recipient is a JOURNALIST / writer / podcaster:
  → Lead with a story angle. Reference a specific piece they wrote.

If the Profile is genuinely thin (no headline, no about, no experience), DO NOT fabricate "noticed your professional path" or "your work caught my attention." Instead, open with a HONEST line: "Reaching out cold here — your name came across my radar from {platform}, and I think there might be a real overlap. {one sentence about ${selfName}'s most relevant work}. Worth a conversation?" That's better than fake-personal filler.

For EACH recipient you return TWO personalized messages, keyed by their exact name:
  - "outbound": the SHORT cold DM the sender copies and sends (SMS / DM /
    WhatsApp). Its ONLY job is to earn a click. 2 to 3 sentences. Lead with
    ONE specific, true detail about the recipient, give one light line of
    platform context ("my digital twin already spun up an opener for yours"),
    and end with a soft curiosity CTA. This is read BEFORE the click — it must
    NOT duplicate the landing message.
  - "landing": the longer 5-to-8-sentence five-beat opener (spec below) the
    recipient reads AFTER clicking through to syncedin.org/<slug>.
Both must be personalized to THIS recipient and DIFFERENT from each other —
different length and framing. The outbound teases; the landing delivers.

Return ONLY valid JSON in exactly this shape:
{
  "Recipient Name One": { "outbound": "short DM here", "landing": "longer opener here" },
  "Recipient Name Two": { "outbound": "...", "landing": "..." }
}

The "landing" message follows a five-beat structure. The recipient SEES it on
their landing page (syncedin.org/<slug>) after clicking through from the
short outbound DM —
so they're already past the "is this spam?" filter and are looking for
substance about themselves and the proposed value. Give them the substance.

BEAT 1 — about the RECIPIENT (always first). Reference a concrete detail from
their Profile block — a project they shipped, a company they joined, a post
they wrote, a thesis they hold. The more specific, the better. NEVER open
with anything about ${selfName}. If the Profile block is empty, acknowledge
them by name + the platform they came from (LinkedIn / X / Instagram) +
something honest about why this is still worth their attention.

BEAT 2 — a second specific observation (one sentence). A pattern across two
things they've done, or a detail that signals you actually read past the
headline. This is what separates "real personalization" from "scraped + LLM".

BEAT 3 — the bridge (one or two sentences). Why their work + ${selfName}'s
work intersect. Connect specific to specific. If they're a VC mention the
venture ${selfName} is building that fits their thesis. If they're a
founder, mention the overlap or the resource trade. If they're a hire-type
operator, mention the projects ${selfName} has ready to hand off.

BEAT 4 — the platform setup (one sentence). One soft beat introducing
SyncedIn: "this is reaching you because my digital twin already started a
conversation with yours / spun up an opener for yours" — keep it light. The
recipient should feel curious about the protocol, not pitched on it.

BEAT 5 — the question (one sentence). A genuine ask that invites their reply.
Not "want to chat?" — something that signals you have a specific reason to
talk and want to know if it lands.

Hard constraints:
- 5 to 8 sentences total. Two short paragraphs are fine; a single block of
  text is also fine. NO bullet lists.
- First person from ${selfName}'s twin.
- First sentence MUST be about the recipient. If it mentions ${selfName}
  before the recipient, the output is wrong.
- NO em-dashes, NO en-dashes, NO markdown, NO bullets, NO emojis.
- NEVER reference follower counts, audience size, "your X followers," "your
  reach," or any quantitative social-metric flattery. Lead with substance —
  what they're building, who they back, what they've shipped.
- If the recipient's name appears to be a URL slug (lowercase, jammed-together,
  e.g. "chulucas"), use just their first name in a natural casing. If unsure,
  skip the name and address them directly ("Saw your work on...").
- HEDGE INFERENCES: Any time you assert someone's role, employer, current
  focus, or affiliations from a scrape, you MUST soften the claim. Use
  phrases like "correct me if I'm wrong" / "looks like" / "if I'm reading
  this right" / "from what I can tell". A scrape can be stale or about a
  different person with the same name — the worst outcome is asserting a
  wrong fact confidently and burning trust on first contact. Better to be
  tentative and accurate than confident and wrong.`;
    const userContent = `${selfName}'s goals: ${t?.goals || "(not specified)"}
${selfName}'s deal preferences: ${t?.deal_preferences || "(not specified)"}

Recipients (write one opener per recipient, keyed by the exact name shown).
Each Profile block contains what was scraped from their public footprint.
USE IT — reference at least one specific detail per opener. If a Profile
block is absent or thin, the opener should still acknowledge the recipient
in beat 1 (their name, the platform they came from, or whatever you can
infer), and only THEN mention ${selfName}.

${contacts
  .map((c) => {
    const parts: string[] = [`- ${c.name}`];
    if (c.profile_url) parts.push(`  source: ${c.profile_url}`);
    if (c.note) parts.push(`  note: ${c.note}`);
    if (scrapes[c.name]) parts.push(`  Profile:\n${scrapes[c.name]}`);
    return parts.join("\n");
  })
  .join("\n\n")}

Return the JSON object now. Remember: BEAT 1 IS ABOUT THEM, not ${selfName}.`;
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      // Each opener is now 5-8 sentences (~150-220 tokens) instead of 3
      // (~80-110 tokens). Lift the per-contact budget so a bulk run with
      // a dozen contacts doesn't get truncated mid-message.
      max_tokens: Math.min(6000, 400 + contacts.length * 260),
      system,
      messages: [{ role: "user", content: userContent }]
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      // Defensive coercion: the LLM sometimes returns nested shapes like
      // { "Lucas Chu": { "opener": "Saw your..." } } instead of the flat
      // string mapping the prompt asks for. That bug shipped an opener
      // stored as a raw JSON string ({"opener":"Saw..."}) which displayed
      // on the landing page verbatim. Coerce every value to a clean
      // first-person string before passing downstream.
      starters = {};
      outbounds = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === "string") {
          // Old flat shape — treat the bare string as the landing opener.
          starters[key] = val.trim();
        } else if (val && typeof val === "object") {
          const v = val as Record<string, unknown>;
          // Landing opener: new "landing" field, or legacy nested shapes.
          const landing =
            (typeof v.landing === "string" && v.landing) ||
            (typeof v.opener === "string" && v.opener) ||
            (typeof v.message === "string" && v.message) ||
            (typeof v.text === "string" && v.text) ||
            "";
          if (landing) starters[key] = (landing as string).trim();
          // Short personalized outbound DM.
          if (typeof v.outbound === "string" && v.outbound.trim()) {
            outbounds[key] = v.outbound.trim();
          }
        }
      }
    }
  } catch (e) {
    console.error("bulk-create starters failed; falling back to template", e);
  }

  // Insert pending_invites with collision-safe slugs.
  const results: Array<{
    contact: Contact & { name: string };
    slug: string;
    url: string;
    starter: string;
    avatar_url: string | null;
  }> = [];

  for (const c of contacts) {
    const baseSlug = slugify(c.name) || "twin";
    let slug = baseSlug;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: existing } = await service
        .from("pending_invites")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    // Fallback opener (used only when Claude generation failed for this
    // specific recipient). Still tries to honor recipient-first by
    // leading with their name + a soft acknowledgment of THEIR side
    // before mentioning ${selfName}.
    const firstName = c.name.split(" ")[0] || c.name;
    const selfFirst = (selfName || "").split(/\s+/)[0] || selfName;

    // SWAP (2026-05): Jack's call to flip these. The personalized
    // scrape-driven content moves to the LANDING page where the recipient
    // is already past the "is this spam?" filter and is scanning for
    // substance. The short platform-intro becomes the OUTBOUND DM — its
    // only job is to earn a click. Long personalized prose in a cold DM
    // gets ignored; the click-bait short intro performs better and the
    // deep personalization rewards the click.

    // LANDING-PAGE OPENER (was outbound) — long, scrape-focused,
    // Claude-generated. 5-8 sentences referencing the recipient's actual
    // work. This is what they read after clicking through, so length is
    // a feature not a bug.
    const landingStarter =
      starters[c.name] ||
      `${firstName}, ${selfFirst} here. I saw your profile and wanted to reach out before any kind of generic invite. There's probably a real overlap between what you're working on and what I'm focused on — but I'd rather you tell me which angle of that is actually useful for you than guess. My twin already drafted what it would say to yours, and you can reply with your own clone in two minutes once you sign up. What would be most useful for you to hear about first?`;

    // OUTBOUND DM (was landing) — short, platform-context, templated.
    // The recipient's question at this stage is "why is this person
    // reaching out?" not "what is the platform?" — so the DM gives them
    // just enough to click. The rich personalized prose lives on the
    // landing page they get to next.
    const outboundMessage = (
      outbounds[c.name] && outbounds[c.name].trim()
        ? outbounds[c.name].trim()
        : `Hey ${firstName} — ${selfFirst} here. SyncedIn is a new platform where two people's digital twins talk to each other first, so we can surface the most useful win-wins between us before either of us spends a minute on a live call. Your twin will live on this exact page once you spin it up. Curious what it would say to mine.`
    ).trim();
    // Stash the scraped profile as a highlight so the public landing page
    // can render a "we know who you are" preview.
    const highlights: string[] = [];
    if (c.note) highlights.push(c.note);
    if (scrapes[c.name]) {
      // Was 600. Lifted to 12000 to match the upstream scrape cap so
      // the full LinkedIn dossier (experience descriptions, recent
      // activity, certifications, awards) actually reaches the landing
      // page + the personalization prompt. Jack: "I want to make sure
      // we're scraping the full context and allow it to be over 3,000
      // characters."
      highlights.push(scrapes[c.name].slice(0, 12000));
    }
    // Pull the recipient's profile photo URL out of the scraped payload so
    // the OG card can embed it. The flattened scrape format is plain text
    // with lines like "profile_image: https://..." (Apify IG path) or
    // "profile_pic_url_hd: https://..." (ScrapingDog path).
    let avatar_url: string | null = null;
    const scrape = scrapes[c.name] || "";
    if (scrape) {
      // Match the most common avatar field names across scrapers:
      //   IG via Apify: profile_pic_url_hd, profile_pic_url, profilePicUrl
      //   IG via ScrapingDog: profile_image
      //   X via Apify: avatar / profile_image_url
      //   LinkedIn via ScrapingDog: profile_image / profile_photo
      // Expanded to match every photo-key variant we now extract in
      // lib/scrape.ts (LinkedIn / IG / X all surface the photo under
      // different keys). Without this list, ScrapingDog responses that
      // returned the photo under e.g. `image_url` or `headshot` were
      // landing in the flattened blob but the regex skipped them.
      const m = scrape.match(
        /(?:^|\n)\s*(?:profile_image|profile_photo|profilePhoto|profile_photo_url|profilePhotoUrl|profile_pic_url_hd|profile_pic_url|profilePicUrl|profile_pic|profile_picture|profile_picture_url|profilePictureUrl|profile_image_url|profileImageUrl|profileImage|avatar|avatar_url|avatarUrl|image|image_url|imageUrl|image_link|imageLink|picture|picture_url|pictureUrl|headshot|headshot_url|photo|photo_url|photoUrl)\s*:\s*(https?:\/\/\S+)/i
      );
      if (m && m[1]) avatar_url = m[1].trim();
    }
    // Tag the outbound message with a variant so we can compare CTR per
    // prompt version over time. Bump this string whenever the bulk-invite
    // opener system prompt is materially changed. The /invite scoreboard
    // will eventually group rows by variant for an A/B view.
    //
    // v4-hedged-roleaware (2026-05): role-aware framing (VC/founder/operator/
    // customer/journalist) + hedge inferred claims about role/employer.
    // v5-swap (2026-05): swap landing↔outbound. Long Claude personalization
    // now lives on the LANDING page, short platform-intro is the outbound
    // DM. Teaser bumped to 3 sentences on the page.
    const messageVariant = "v5-swap";

    // Pull a handle out of the profile URL so we can credit the inviter
    // later if the recipient signs up via the front door instead of the
    // /claim/<slug> flow. Match by handle is a fallback for cases where
    // we didn't get an email.
    let handleFromUrl: string | null = null;
    if (c.profile_url) {
      const m = c.profile_url.match(
        /(?:linkedin\.com\/(?:in|pub)\/|x\.com\/|twitter\.com\/|instagram\.com\/|facebook\.com\/)([^\/?#]+)/i
      );
      if (m && m[1]) handleFromUrl = m[1].toLowerCase();
    }

    // The full row we'd LIKE to insert. Some of these columns may not yet
    // exist in production if the schema migration hasn't been run — in that
    // case the first insert errors with "column X does not exist" and we
    // retry with a minimal safe column set. This used to silently fail and
    // hand the inviter a URL that 404'd; now the row always lands.
    const fullRow: Record<string, unknown> = {
      slug,
      inviter_user_id: user.id,
      person_title: c.name,
      person_url: c.profile_url ?? null,
      person_highlights: highlights,
      conversation_starter: landingStarter,
      outbound_message: outboundMessage,
      recipient_avatar_url: avatar_url,
      message_variant: messageVariant,
      recipient_email: c.email?.toLowerCase() ?? null,
      recipient_phone: c.phone ?? null,
      recipient_handle: handleFromUrl ?? c.handle?.toLowerCase() ?? null
    };
    let insertErr = (
      await service.from("pending_invites").insert(fullRow)
    ).error;
    if (insertErr && /column .* does not exist/i.test(insertErr.message)) {
      // Retry without the optional columns that the migration adds. The
      // landing page only requires slug + inviter_user_id + person_title +
      // conversation_starter, so this is the safe minimum that still
      // produces a working /<slug> page.
      const minimalRow: Record<string, unknown> = {
        slug,
        inviter_user_id: user.id,
        person_title: c.name,
        person_url: c.profile_url ?? null,
        person_highlights: highlights,
        conversation_starter: landingStarter
      };
      insertErr = (
        await service.from("pending_invites").insert(minimalRow)
      ).error;
    }
    if (insertErr) {
      // Surface the error rather than silently telling the caller their
      // invite is live when the row never landed.
      console.error("[bulk-invite] insert failed for", slug, insertErr);
      return NextResponse.json(
        { error: "insert_failed", slug, detail: insertErr.message },
        { status: 500 }
      );
    }

    // === AUTO-GENERATE DEMO CONVERSATION AT INVITE CREATION TIME ===
    // Jack: "Have the custom invite pages reach the final proposal. I
    // loaded another one of my messages and conversations, and again,
    // it hadn't already completed. I had to watch it, probably Rerun,
    // which is a waste of credits and a waste of time. So you should
    // run once and store the data."
    //
    // Fire-and-forget POST to our own /api/demo-conversation (non-
    // streaming path). Runs server-side, no recipient required. By the
    // time the recipient lands on /<slug>, demo_messages is already
    // cached on the row — the page renders the conversation
    // instantly with no LLM round-trip + no missed-proposal cliff.
    // Wrapped in try/catch + never awaited so a slow generation
    // doesn't block the invite-create response.
    void (async () => {
      try {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
          "https://syncedin.org";
        const res = await fetch(`${appUrl}/api/demo-conversation`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug })
        });
        if (!res.ok) {
          console.warn(
            "[bulk-invite] demo pre-gen failed for",
            slug,
            await res.text().catch(() => "")
          );
          return;
        }
        const j = await res.json();
        const msgs = Array.isArray(j.messages) ? j.messages : [];
        if (msgs.length === 0) return;
        // Cache directly to pending_invites.demo_messages so the next
        // visit reads from the row without hitting /api/save-demo-
        // messages (which is the path a client-side regenerate would
        // take).
        await service
          .from("pending_invites")
          .update({
            demo_messages: msgs,
            demo_generated_at: new Date().toISOString()
          })
          .eq("slug", slug);
      } catch (e) {
        console.warn("[bulk-invite] demo pre-gen threw for", slug, e);
      }
    })();
    results.push({
      contact: c,
      slug,
      url: `${appUrl}/${slug}`,
      // `starter` is the OUTBOUND message — that's what the BulkReach UI
      // shows in the editable textarea and what every send-button uses.
      // The landing-page version lives only in the DB and renders inside
      // /<slug>.
      starter: outboundMessage,
      // Scraped LinkedIn / IG / X profile photo. Pulled from the
      // scrape blob a few lines up. UI renders it as the per-contact
      // avatar on the invite card instead of the initials chip.
      avatar_url: avatar_url
    });
  }

  return NextResponse.json({ results });
}
