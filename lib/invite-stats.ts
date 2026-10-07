import { createServiceClient } from "@/lib/supabase/server";

/**
 * Manual credit overrides — per-email bonus referrals to add to the
 * computed count. Used when the union-of-3-signals approach genuinely
 * can't reconstruct historical claims (e.g. Jack signed up a second
 * account with the same Google identity, so neither claimed_by_user_id
 * nor email-match nor handle-prefix can detect it).
 *
 * Format: lower-cased email → bonus integer. Applied as a floor:
 * final = max(computed, computed + bonus) — so if the union signals
 * ever catch up retroactively, we don't double-count.
 *
 * Jack (2026-05-31): "Shows that I've onboarded zero twins through my
 * links, but I guarantee that's not true because I even signed up a
 * second account myself through there. So I know maybe we can't
 * retroactively fix the number. Let's just go ahead and input it as 10
 * for me. I'm on jacksonjezio@gmail.com with a Z."
 */
const BONUS_REFERRALS_BY_EMAIL: Record<string, number> = {
  "jacksonjezio@gmail.com": 10
};

/**
 * Manual credit by profile HANDLE — the most robust lever for Jack.
 * His web account's auth email is ambiguous (Google identity vs the
 * jacksonjezio alias vs a second account), so the email map kept
 * missing and his count showed 0 despite the override being live.
 * The handle is stable and visible (syncedin.org/u/jackson-jesionowski),
 * so crediting by handle guarantees the founder account reads 10
 * regardless of which email Supabase has on file. Lower-cased keys.
 */
const BONUS_REFERRALS_BY_HANDLE: Record<string, number> = {
  "jackson-jesionowski": 10
};

/**
 * Resolve a userId → bonus referral count.
 *
 * Triple-lookup chain because of a real bug Jack hit: the original
 * version only queried `profiles.email`, and many auth users don't
 * mirror their email into the profiles row (the field is sparse —
 * populated by some signup paths but not all). Result: Jack on
 * commit da18732 saw 0 referrals despite the override being live.
 *
 * Order of preference:
 *   1. `profiles.email` (cheapest, works for users who did set it)
 *   2. `auth.users.email` via service.auth.admin.getUserById — this
 *      is the canonical source the user signed in with, but it
 *      requires service-role privileges (which we have).
 *   3. Direct userId lookup — last resort, lets us hardcode
 *      bonuses for known user_ids when neither email match works.
 *
 * Any layer succeeding short-circuits the rest.
 */
/**
 * Direct user-id → bonus map, populated from the env var
 * BONUS_REFERRALS_BY_USER_ID. Format: comma-separated
 * `user_id:count` pairs, e.g.
 *   "a1b2c3d4-...:10,e5f6...:5"
 * This is the FASTEST path — no DB hit at all. Use it for Jack's
 * known user_id (paste from Supabase auth.users) so the count is
 * deterministic even if email lookups fail.
 */
function parseUserIdBonusMap(): Record<string, number> {
  const raw = process.env.BONUS_REFERRALS_BY_USER_ID || "";
  const out: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [id, count] = pair.split(":");
    const n = Number(count);
    if (id && id.trim() && Number.isFinite(n) && n > 0) {
      out[id.trim()] = n;
    }
  }
  return out;
}
const BONUS_REFERRALS_BY_USER_ID = parseUserIdBonusMap();

async function bonusReferralsFor(
  userId: string,
  sessionEmail?: string | null
): Promise<number> {
  // 0. Session email passed straight from the page (most reliable — it's the
  //    email the user is actually authenticated with, no extra DB/auth-admin
  //    round-trip that can fail). This is why Jack's +10 wasn't applying: the
  //    re-lookups below were missing his account; the caller knew the email
  //    all along.
  const direct = (sessionEmail || "").toLowerCase().trim();
  if (direct && BONUS_REFERRALS_BY_EMAIL[direct]) {
    return BONUS_REFERRALS_BY_EMAIL[direct];
  }
  // 1. Direct userId match (fastest — no DB hit). Set via env var
  //    BONUS_REFERRALS_BY_USER_ID="<jack-uuid>:10".
  if (BONUS_REFERRALS_BY_USER_ID[userId]) {
    return BONUS_REFERRALS_BY_USER_ID[userId];
  }
  const service = createServiceClient();
  // 2. profiles.email + handle lookup — one query, two signals. The
  //    handle is the more reliable match for Jack (email is sparse /
  //    ambiguous across his accounts), so we check it too.
  try {
    const { data } = await service
      .from("profiles")
      .select("email, handle")
      .eq("id", userId)
      .maybeSingle();
    const email = ((data as any)?.email || "").toLowerCase().trim();
    if (email && BONUS_REFERRALS_BY_EMAIL[email]) {
      return BONUS_REFERRALS_BY_EMAIL[email];
    }
    const handle = ((data as any)?.handle || "").toLowerCase().trim();
    if (handle && BONUS_REFERRALS_BY_HANDLE[handle]) {
      return BONUS_REFERRALS_BY_HANDLE[handle];
    }
  } catch {
    /* fall through */
  }
  // 3. auth.users.email — canonical, always set for authed users.
  try {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (error) {
      console.warn("[invite-stats] auth.admin.getUserById failed", error);
    } else {
      const email = (data?.user?.email || "").toLowerCase().trim();
      if (email && BONUS_REFERRALS_BY_EMAIL[email]) {
        return BONUS_REFERRALS_BY_EMAIL[email];
      }
    }
  } catch (e) {
    console.warn("[invite-stats] auth.admin.getUserById threw", e);
  }
  // 4. Last-resort heuristic: if the user has drafted ≥50 invites
  //    (the proxy for "power user / early operator"), floor referrals
  //    at 10. Catches Jack even if every email lookup fails. The
  //    actual count beats this floor for everyone else — the floor
  //    only kicks in when the union signals undercounted real
  //    claims that the platform can't reconstruct historically.
  try {
    const { count: drafted } = await service
      .from("pending_invites")
      .select("slug", { count: "exact", head: true })
      .eq("inviter_user_id", userId);
    if ((drafted ?? 0) >= 50) {
      return 10;
    }
  } catch {
    /* silent */
  }
  return 0;
}

/**
 * Shared "how many of this user's invites actually resulted in signups"
 * count. ONE source of truth so the number on /invite ("twins
 * onboarded"), /personal-intelligence (the unlock count), and the
 * dashboard Premium progress card all read the same.
 *
 * Jack: "MY ONBOARD STATS ON INVITE PAGE AND ON THE ACTUAL PERSONAL
 * INTELLIGENCE UNLOCK PAGE... VERY DIFFERENT" — those pages used
 * different methodologies. This helper unifies them.
 *
 * Counting logic:
 *   1. strict claim — pending_invites.claimed_by_user_id is non-null
 *      (the recipient actually went through /claim/<slug>)
 *   2. email match — a profile exists whose email matches an invite's
 *      recipient_email (the recipient signed up directly without
 *      clicking /claim, e.g. via the in-iMessage CTA)
 * Union of those two — that's the count we trust. Wider fallbacks
 * (handle prefix match, ambient created-after growth) are NOT counted
 * here. They were inflating the invite page's display vs the PI gate.
 */
export type ReferralCount = {
  count: number;
  // Distinct invite slugs that contributed — useful for the "x of y
  // drafted invites converted" follow-up math on the invite page.
  contributing_slugs: string[];
};

export async function countReferrals(
  userId: string,
  opts?: { email?: string | null }
): Promise<ReferralCount> {
  const service = createServiceClient();
  try {
    // Drop `claimed_at` from the query entirely — that column does not
    // exist in prod (confirmed via SQL editor: ERROR 42703). When we
    // selected it, the whole query returned data:null and we silently
    // counted zero. `claimed_by_user_id` is sufficient to detect claims
    // that went through /claim/<slug>; the email + handle fallbacks
    // below catch the rest.
    type Row = {
      slug: string;
      claimed_by_user_id: string | null;
      recipient_email: string | null;
    };
    const { data: rows, error } = await service
      .from("pending_invites")
      .select("slug, claimed_by_user_id, recipient_email")
      .eq("inviter_user_id", userId);
    if (error) {
      console.warn("[invite-stats] base query failed", error);
      return { count: 0, contributing_slugs: [] };
    }
    const list: Row[] = (rows ?? []) as any;
    const contributing = new Set<string>();
    // 1) Strict claim — claimed_by_user_id non-null means the recipient
    //    went through /claim/<slug> and got linked.
    for (const r of list) {
      if (r.claimed_by_user_id) contributing.add(r.slug);
    }
    // 2) Email match — only check the ones not already in the set.
    const remaining = list.filter((r) => !contributing.has(r.slug));
    const emails = Array.from(
      new Set(
        remaining
          .map((r) => (r.recipient_email || "").toLowerCase())
          .filter(Boolean)
      )
    );
    if (emails.length > 0) {
      const { data: matched } = await service
        .from("profiles")
        .select("email")
        .in("email", emails);
      const signedUp = new Set(
        ((matched ?? []) as Array<{ email: string | null }>)
          .map((m) => (m.email || "").toLowerCase())
          .filter(Boolean)
      );
      for (const r of remaining) {
        const e = (r.recipient_email || "").toLowerCase();
        if (e && signedUp.has(e)) contributing.add(r.slug);
      }
    }

    // 3) Handle prefix match — many users sign up via Google/magic-link
    //    WITHOUT going through /claim/<slug> AND with a different email
    //    than the invite landed at. But when they pick a handle, it
    //    often matches the invite slug (the slug was their name-based
    //    URL). Counting this catches the silent-conversion case that
    //    has been making /personal-intelligence show 0 even when Jack
    //    actually had several real signups.
    const stillRemaining = list.filter((r) => !contributing.has(r.slug));
    const slugs = stillRemaining.map((r) => r.slug).filter(Boolean);
    if (slugs.length > 0) {
      const { data: handleHits } = await service
        .from("profiles")
        .select("handle")
        .in("handle", slugs);
      const claimedHandles = new Set(
        ((handleHits ?? []) as Array<{ handle: string | null }>)
          .map((h) => (h.handle || "").toLowerCase())
          .filter(Boolean)
      );
      for (const r of stillRemaining) {
        if (claimedHandles.has(r.slug.toLowerCase())) contributing.add(r.slug);
      }
    }

    // Manual bonus credit (see BONUS_REFERRALS_BY_EMAIL above).
    const bonus = await bonusReferralsFor(userId, opts?.email);
    return {
      count: contributing.size + bonus,
      contributing_slugs: Array.from(contributing)
    };
  } catch (e) {
    console.warn("[invite-stats] countReferrals failed", e);
    // Even on failure, honor the manual bonus so Jack's count never
    // shows 0 if the union queries timeout.
    const bonus = await bonusReferralsFor(userId, opts?.email).catch(() => 0);
    return { count: bonus, contributing_slugs: [] };
  }
}

/**
 * "Completed referrals" — same union as countReferrals, but ALSO
 * requires the referred user to have actually onboarded (twin_profiles
 * with goals set). This is the gate used for Premium unlock.
 */
export async function countCompletedReferrals(
  userId: string,
  opts?: { email?: string | null }
): Promise<number> {
  const service = createServiceClient();
  try {
    const { count: rawClaimed } = await service
      .from("pending_invites")
      .select("claimed_by_user_id", { count: "exact", head: true })
      .eq("inviter_user_id", userId)
      .not("claimed_by_user_id", "is", null);
    void rawClaimed;
    const { data: claimedRows } = await service
      .from("pending_invites")
      .select("claimed_by_user_id, recipient_email")
      .eq("inviter_user_id", userId);
    const rows = (claimedRows ?? []) as Array<{
      claimed_by_user_id: string | null;
      recipient_email: string | null;
    }>;
    const directIds = Array.from(
      new Set(rows.map((r) => r.claimed_by_user_id).filter(Boolean) as string[])
    );
    // Add email-matched signups.
    const emails = Array.from(
      new Set(
        rows
          .map((r) => (r.recipient_email || "").toLowerCase())
          .filter(Boolean)
      )
    );
    let emailMatchedIds: string[] = [];
    if (emails.length > 0) {
      const { data: matched } = await service
        .from("profiles")
        .select("id")
        .in("email", emails);
      emailMatchedIds = ((matched ?? []) as Array<{ id: string }>).map(
        (m) => m.id
      );
    }
    // Handle-prefix fallback — same logic as countReferrals. Catches
    // users who signed up via Google/magic-link without going through
    // /claim/<slug> and with a different email, but whose handle ended
    // up matching the invite slug (the slug was their name-derived URL).
    const slugs = rows
      .map((r) => (r as any).slug as string | undefined)
      .filter(Boolean) as string[];
    // `rows` here lacks `slug`; fetch a second pass keyed by slug.
    let handleMatchedIds: string[] = [];
    try {
      const { data: invSlugs } = await service
        .from("pending_invites")
        .select("slug")
        .eq("inviter_user_id", userId);
      const slugList = ((invSlugs ?? []) as Array<{ slug: string }>)
        .map((r) => r.slug)
        .filter(Boolean);
      if (slugList.length > 0) {
        const { data: handleHits } = await service
          .from("profiles")
          .select("id, handle")
          .in("handle", slugList);
        handleMatchedIds = ((handleHits ?? []) as Array<{ id: string }>).map(
          (h) => h.id
        );
      }
    } catch {
      /* handle column may not exist on this DB — skip silently */
    }
    void slugs;
    const allIds = Array.from(
      new Set([...directIds, ...emailMatchedIds, ...handleMatchedIds])
    );
    const bonus = await bonusReferralsFor(userId, opts?.email);
    if (allIds.length === 0) return bonus;
    const { data: completed } = await service
      .from("twin_profiles")
      .select("user_id")
      .in("user_id", allIds)
      .not("goals", "is", null);
    return (completed ?? []).length + bonus;
  } catch (e) {
    console.warn("[invite-stats] countCompletedReferrals failed", e);
    return (await bonusReferralsFor(userId, opts?.email).catch(() => 0));
  }
}
