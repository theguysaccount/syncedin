/**
 * Shared copy helpers for the invite landing page + OG card.
 *
 * Both surfaces (the static social-preview PNG and the live HTML hero)
 * pull the same observation snippet from the personalized Claude-generated
 * landing message AND wrap it in the same "Recipient, it's time to get
 * SyncedIn." template. Centralizing here means the two never drift out
 * of sync — change the template once, both surfaces update.
 */

/**
 * Pull the most specific observation snippet out of the personalized
 * landing-page opener so the OG card and animated hero can both read like
 * a real cold reach instead of generic "my twin already drafted an
 * opener for yours" filler.
 *
 * Heuristic:
 *   1. Drop a leading "Hey {name} — {sender} here." greeting if present.
 *   2. Take the first remaining sentence.
 *   3. Normalize first-person voice into third-person noun-phrase form
 *      ("Your founding engineer work caught my eye" → "your founding
 *      engineer work").
 *   4. Truncate at a word boundary around 110 chars.
 *   5. Strip trailing punctuation so the template can chain into ", and..."
 */
export function observationSnippet(
  starter: string | null | undefined
): string {
  const s = (starter ?? "").trim();
  if (!s) return "";
  const noGreeting = s.replace(
    /^hey\s+[A-Za-z][A-Za-z'.-]*\s*[—–-]\s*[^.!?]+[.!?]\s*/i,
    ""
  );
  const noComma = noGreeting.replace(/^[A-Za-z][A-Za-z'.-]+,\s+/, "");
  const sentences = noComma.split(/(?<=[.!?])\s+/);
  let first = (sentences[0] ?? "").trim();
  if (!first) return "";
  first = first
    .replace(/^(i\s+(noticed|saw|love|loved|like|liked)\s+(that\s+)?)/i, "")
    .replace(/^(what\s+caught\s+my\s+eye\s+is\s+(that\s+)?)/i, "")
    .replace(/\s+caught\s+my\s+eye\.?$/i, "")
    .trim();
  if (first.length > 0 && /[A-Z]/.test(first[0])) {
    first = first[0].toLowerCase() + first.slice(1);
  }
  if (!/^(your|the|how)\b/i.test(first)) {
    first = "your " + first;
  }
  // Cut at a CLAUSE boundary, not an arbitrary character count. The old
  // fixed 130-char slice chopped mid-phrase and produced dangling copy on
  // the OG card ("...because that framing is exactly the" chained straight
  // into "and is ready to have their agent"). Trimming at the first comma /
  // semicolon / conjunction keeps the snippet a self-contained noun phrase.
  first = first
    .split(/\s*[;:]\s*|\s*,\s*(?=because|which|and|but|so|since|while)\b|\s+\b(?:because|which)\b\s+/i)[0]
    .trim();

  // Strip a trailing first-person reaction clause. The snippet gets framed
  // as "{Inviter} saw {snippet}", so leaving the sender's own reaction in
  // produces "saw your line about X stopped me mid-scroll". Cut at the
  // reaction verb and keep just the thing they observed.
  first = first
    .replace(
      /\s+\b(?:stopped|caught|grabbed|made|got|hooked|struck|kept|left|had)\s+(?:me|my|us)\b.*$/i,
      ""
    )
    .replace(/\s+\bresonated\s+with\s+(?:me|us)\b.*$/i, "")
    .replace(/\s+\bis\s+(?:exactly|precisely)\b.*$/i, "")
    .trim();

  // Card-safe length. 92 keeps the rendered body inside the OG box at the
  // headline+body font sizes; longer than that overflowed and got clipped.
  const HARD = 92;
  if (first.length > HARD) {
    const cut = first.slice(0, HARD);
    const lastSpace = cut.lastIndexOf(" ");
    first = (lastSpace > 50 ? cut.slice(0, lastSpace) : cut).trim();
  }
  first = first.replace(/[.,;:!?…\s]+$/g, "");

  // Never end on a dangling function word — "is exactly the", "and the",
  // "with a" all read as broken. Walk back to the last content word.
  const DANGLING =
    /^(the|a|an|and|or|but|so|to|of|in|on|at|for|with|from|by|as|is|are|was|were|be|been|that|this|these|those|it|its|their|his|her|my|your|our|about|into|than|then|exactly|really|very|more|most|just|also|because|which|while|when|who|what|how)$/i;
  let parts = first.split(/\s+/);
  while (parts.length > 2 && DANGLING.test(parts[parts.length - 1])) {
    parts.pop();
  }
  first = parts.join(" ").replace(/[.,;:!?…\s]+$/g, "");

  return first;
}

export function buildInviteCopy(opts: {
  inviterFullName: string;
  recipientShortName: string;
  snippet: string;
}): { headline: string; body: string } {
  const { inviterFullName, recipientShortName, snippet } = opts;
  const headline = `${recipientShortName}, it's time to get SyncedIn.`;

  // Quality gate on the snippet so we never emit broken phrases like
  // "saw your jackson here" (Jack's bug — the AI starter mentioned
  // himself by name and that bled into the snippet). Reject any snippet
  // that:
  //  - contains the inviter's first name (would create "Jack saw your jack...")
  //  - is shorter than 12 chars (too thin to be specific)
  //  - is essentially just demonstrative ("your work", "your post")
  const inviterFirst = (inviterFullName || "").split(/\s+/)[0] ?? "";
  const recipientFirst = (recipientShortName || "").split(/\s+/)[0] ?? "";
  const lowSnippet = (snippet || "").toLowerCase();
  const looksBroken =
    !snippet ||
    snippet.length < 12 ||
    (inviterFirst &&
      lowSnippet.includes(inviterFirst.toLowerCase()) &&
      inviterFirst.length > 2) ||
    (recipientFirst &&
      lowSnippet.includes(recipientFirst.toLowerCase()) &&
      recipientFirst.length > 2) ||
    /^your\s+(work|post|profile|page|stuff|thing|background|here)\.?$/i.test(
      snippet.trim()
    );

  // Gender-neutral pronoun — "his" was assuming. "their" works for any
  // inviter and reads naturally.
  // No em-dash (house rule) and no run-on: the old template chained the
  // snippet into an em-dash clause, which both read as AI-written and blew
  // past the OG card's height once the snippet ran long. Two short
  // sentences render predictably at any snippet length.
  const body = looksBroken
    ? `${inviterFullName} thinks your twin is worth a conversation with theirs. Spin yours up and let the two clones find the win-win.`
    : `${inviterFullName} saw ${snippet}, and their agent is ready to find a plan with yours.`;
  return { headline, body };
}
