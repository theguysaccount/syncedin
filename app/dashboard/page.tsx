import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  startTestConversation,
  startConversationWithUser
} from "./actions";
import { BulkReachToolkit } from "../BulkReachToolkit";
import { ExcitementControl } from "./ExcitementControl";
import { SyncMeter } from "../SyncMeter";
import { SummaryBackfill } from "./SummaryBackfill";
import { DiscoverSearch } from "./DiscoverSearch";
import { ScrollTopOnSaved } from "./ScrollTopOnSaved";
import { Avatar } from "../Avatar";
import { deriveIceberg } from "@/lib/iceberg";
import { AppShell } from "../AppShell";
import { ClientDate } from "../ClientDate";
import { computePairScore } from "@/lib/pair-score";
import { QuickFeedbackWidget } from "./QuickFeedbackWidget";
import { PremiumProgressCard } from "./PremiumProgressCard";
import { ConversationsList, type ConversationRow } from "./ConversationsList";
import { countCompletedReferrals } from "@/lib/invite-stats";
import { computeSyncScore } from "@/lib/sync-score";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  // ── Invite gate DISABLED ────────────────────────────────────────────
  // Real-user feedback: the hard 2-invite requirement felt like an
  // interrogation. The user added 2 emails + sent via a broadcast
  // channel, the gate (which only counts generated personalized invites)
  // still blocked them — same screen, same message, no path forward.
  //
  // Invites should be encouragement, not a dashboard-blocking gate.
  // Keeping the count fetch in case a softer prompt wants to surface
  // ("you've sent N invites — try the personalized flow next") later.
  const { count: myInviteCount } = await service
    .from("pending_invites")
    .select("slug", { count: "exact", head: true })
    .eq("inviter_user_id", user.id);
  void myInviteCount;

  // Parallelize the independent first wave: my twin, my profile, my
  // conversations, sample personas, all real users for discovery.
  const [
    { data: twin },
    { data: myProfile },
    { data: conversations },
    { data: testPersonas },
    { data: allRealUsers }
  ] = await Promise.all([
    supabase
      .from("twin_profiles")
      .select(
        "user_id, goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select(
        "id, participant_a, participant_b, status, created_at, summary, counterpart_summary, excitement_score, excitement_locked, sync_score_override"
      )
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      // Perf cap (#271): keep dashboard responsive even for power users
      // with hundreds of historical convos. Most recent 60 is plenty for
      // the rendered list; archive view (TBD) can paginate.
      .limit(60),
    service
      .from("profiles")
      .select("id, display_name, email")
      .eq("is_test_persona", true)
      .order("display_name", { ascending: true })
      .limit(20),
    service
      .from("profiles")
      // Include created_at so we can surface NEW signups at the top of
      // the directory (Jack: "move those new people up top of the
      // already on syncedin part, and the discover part"). Fresh joiners
      // are the most valuable to engage with — they're actively building
      // their twin RIGHT NOW.
      .select("id, display_name, email, avatar_url, created_at")
      .eq("is_test_persona", false)
      .neq("id", user.id)
      // Perf cap (#271): was unbounded — scales with total signups and
      // becomes the slowest query on dashboard once user base grows.
      // 200 most-recently-active is more than the Find People UI shows
      // anyway. Ordering by last_active_at puts the most relevant users
      // first AND aligns with the discovery scoring downstream.
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(200)
  ]);

  const twinComplete = Boolean(twin?.goals);

  // Unified completed-referral count — shared helper backs /invite,
  // /personal-intelligence, and this dashboard card so all three
  // surfaces read the same number.
  const completedReferrals = await countCompletedReferrals(user.id, {
    email: user.email
  });

  const otherIds = (conversations ?? []).map((c) =>
    c.participant_a === user.id ? c.participant_b : c.participant_a
  );
  const personaIds = (testPersonas ?? []).map((p) => p.id);
  const realUserIds = (allRealUsers ?? []).map((p) => p.id);

  // Parallelize the second wave that depends on the first.
  const [
    { data: others },
    { data: personaTwins },
    { data: realTwins }
  ] = await Promise.all([
    otherIds.length
      ? service
          .from("profiles")
          .select(
            "id, display_name, email, is_test_persona, avatar_url, linkedin_url, x_url, instagram_url, facebook_url, website_url, last_active_at"
          )
          .in("id", otherIds)
      : Promise.resolve({ data: [] as any[] }),
    personaIds.length
      ? service
          .from("twin_profiles")
          .select("user_id, goals")
          .in("user_id", personaIds)
      : Promise.resolve({ data: [] as any[] }),
    realUserIds.length
      ? service
          .from("twin_profiles")
          .select(
            "user_id, goals, deal_preferences, ai_export_blob, communication_style, deal_breakers, current_city, hometown"
          )
          .in("user_id", realUserIds)
      : Promise.resolve({ data: [] as any[] })
  ]);

  const nameById = new Map(
    (others ?? []).map((p) => [p.id, p.display_name || p.email] as const)
  );
  const isTestById = new Map(
    (others ?? []).map((p) => [p.id, p.is_test_persona] as const)
  );
  const avatarById = new Map(
    (others ?? []).map((p) => [p.id, p.avatar_url ?? null] as const)
  );
  // Last-active stamp per counterpart — drives the "active 3h ago"
  // pill on each conversation card. May be null if the user hasn't
  // logged in since the column was added; the badge gracefully hides.
  const lastActiveById = new Map<string, string | null>(
    (others ?? []).map(
      (p) => [p.id, (p as any).last_active_at ?? null] as const
    )
  );
  const personaGoal = new Map(
    (personaTwins ?? []).map((t) => [t.user_id, t.goals ?? ""] as const)
  );
  const twinByUser = new Map(
    (realTwins ?? []).map((t) => [t.user_id, t] as const)
  );
  // Per-counterpart social URLs map for inline icon rendering on each
  // conversation card. Pulls from BOTH:
  //   - profiles.{linkedin_url,x_url,instagram_url,facebook_url,website_url}
  //   - URLs extracted from the counterpart's twin ai_export_blob
  // The blob path catches users who connected Sources during onboarding
  // (which adds linkedin.com/in/... and similar to the blob) but never
  // explicitly filled the social columns. Jack: "make sure we have the
  // little icons and if they've linked their social media profiles."
  // Built AFTER twinByUser so the blob lookup works.
  function pickFirstUrl(blob: string, patterns: RegExp[]): string | null {
    if (!blob) return null;
    for (const re of patterns) {
      const m = blob.match(re);
      if (m && m[0]) return m[0];
    }
    return null;
  }
  const socialsById = new Map<
    string,
    {
      linkedin_url?: string | null;
      x_url?: string | null;
      instagram_url?: string | null;
      facebook_url?: string | null;
      website_url?: string | null;
    } | null
  >();
  for (const p of (others ?? []) as any[]) {
    const otherTwin = (twinByUser.get(p.id) as any) ?? null;
    const blob =
      `${otherTwin?.ai_export_blob ?? ""}\n${otherTwin?.goals ?? ""}\n${otherTwin?.deal_preferences ?? ""}`;
    const linkedin =
      p.linkedin_url ??
      pickFirstUrl(blob, [
        /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-z0-9-]+\/?/i
      ]);
    const x =
      p.x_url ??
      pickFirstUrl(blob, [
        /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-z0-9_]+\/?/i
      ]);
    const instagram =
      p.instagram_url ??
      pickFirstUrl(blob, [
        /https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9_.]+\/?/i
      ]);
    const facebook =
      p.facebook_url ??
      pickFirstUrl(blob, [
        /https?:\/\/(?:www\.)?facebook\.com\/[a-z0-9.]+\/?/i
      ]);
    const u = {
      linkedin_url: linkedin,
      x_url: x,
      instagram_url: instagram,
      facebook_url: facebook,
      website_url: p.website_url ?? null
    };
    const hasAny =
      u.linkedin_url ||
      u.x_url ||
      u.instagram_url ||
      u.facebook_url ||
      u.website_url;
    socialsById.set(p.id, hasAny ? u : null);
  }
  // Discovery directory: real users with a finished twin you're NOT already
  // in a conversation with. Once you've connected, they drop off discovery —
  // the space below pivots to inviting more people.
  const existingConvoIds = new Set(otherIds);
  /**
   * Lightweight token-overlap score between two twin profiles. Returns
   * 0-100. Token similarity over (goals + deal_preferences + ai_export_blob
   * + communication_style) with a tiny floor so even thin-profile matches
   * get a non-zero number. Server-side and instant — no LLM call needed
   * to display these on first paint. Good enough as a "warm hint" until we
   * upgrade to a Claude-scored job that runs once per (a,b) pair.
   */
  function jaccardScore(a: string, b: string): number {
    const norm = (s: string) =>
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
    const STOP = new Set([
      "with",
      "from",
      "that",
      "this",
      "have",
      "your",
      "they",
      "them",
      "into",
      "about",
      "their",
      "where",
      "which",
      "would",
      "could",
      "should",
      "while",
      "people",
      "looking",
      "really",
      "after",
      "before",
      "every",
      "right",
      "still",
      "going",
      "company"
    ]);
    const arrA = Array.from(new Set(norm(a).filter((w) => !STOP.has(w))));
    const arrB = Array.from(new Set(norm(b).filter((w) => !STOP.has(w))));
    if (arrA.length === 0 || arrB.length === 0) return 0;
    const setB = new Set(arrB);
    let overlap = 0;
    for (const w of arrA) if (setB.has(w)) overlap += 1;
    const union = arrA.length + arrB.length - overlap;
    return Math.round((overlap / union) * 100);
  }
  const myBlob = [
    twin?.goals ?? "",
    (twin as any)?.deal_preferences ?? "",
    (twin as any)?.communication_style ?? "",
    (twin as any)?.ai_export_blob ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  const directory = (allRealUsers ?? [])
    .map((p) => {
      const t = twinByUser.get(p.id) as any;
      // Headline fallback: first SUBSTANTIVE line of ai_export_blob. The
      // earlier picker accepted the first 20-200 char line — which often
      // matched "# Public footprint (https://...)", a markdown source
      // header, and showed up on contact rows as the "context". Now we
      // skip: markdown headers (#), bare URLs, key:value scaffolding
      // lines, and anything under 4 words.
      const blob = (t?.ai_export_blob || "") as string;
      const headlineFromBlob = (() => {
        if (!blob || typeof blob !== "string") return "";
        const lines = blob
          .split(/[\n\r]/)
          .map((l: string) => l.trim())
          .filter(Boolean);
        for (const l of lines) {
          if (l.length < 28 || l.length > 220) continue;
          if (l.startsWith("#")) continue; // markdown header
          if (/^https?:\/\/\S+\s*$/.test(l)) continue; // bare URL line
          if (/^[a-zA-Z_][\w\s]{0,30}:\s*https?:\/\//.test(l)) continue; // "key: https://..."
          const words = l.split(/\s+/);
          if (words.length < 4) continue;
          return l;
        }
        return "";
      })();
      // Deterministic 4-signal pair score replacing the old "every twin
      // shows 12% because the raw jaccard rounded to 2 and the floor took
      // over." See lib/pair-score.ts for the math.
      const connection_score = computePairScore(twin ?? {}, t ?? {});
      return {
        ...p,
        goals: t?.goals ?? null,
        deal_preferences: t?.deal_preferences ?? null,
        headline_fallback: headlineFromBlob,
        location: (t as any)?.current_city || (t as any)?.hometown || null,
        connection_score,
        // Surface signup recency so the sort below can put fresh joiners
        // at the top of the directory.
        created_at_ms: (p as any).created_at
          ? new Date((p as any).created_at).getTime()
          : 0
      };
    })
    // Only show twins who have ACTUALLY put data into onboarding.
    // The directory previously surfaced users who had only signed up
    // (email-as-display-name, blank twin row) which read as 0% sync
    // dead-ends. Substance gate: goals > 5 chars OR ai_export_blob > 80
    // chars OR deal_preferences > 5 chars. Same threshold the find-people
    // route already uses to pick poll respondents.
    .filter((p) => {
      if (existingConvoIds.has(p.id)) return false;
      const t = twinByUser.get(p.id);
      const hasGoals = (t?.goals ?? "").trim().length > 5;
      const hasDealPrefs = (t?.deal_preferences ?? "").trim().length > 5;
      const hasBlob =
        ((t as any)?.ai_export_blob ?? "").trim().length > 80;
      return hasGoals || hasDealPrefs || hasBlob;
    })
    // Sort: NEW signups (last 14 days) at top, ordered by created_at desc.
    // Then everyone else by connection_score desc. Jack: "move those new
    // people up top of the already on syncedin part, and the discover
    // part." Fresh joiners are the most engagement-likely AND the most
    // appreciative when reached out to — they're actively building.
    .sort((a, b) => {
      const cutoff = Date.now() - 14 * 86_400_000;
      const aFresh = a.created_at_ms >= cutoff;
      const bFresh = b.created_at_ms >= cutoff;
      if (aFresh && !bFresh) return -1;
      if (!aFresh && bFresh) return 1;
      if (aFresh && bFresh) return b.created_at_ms - a.created_at_ms;
      return b.connection_score - a.connection_score;
    });

  const realConversations = (conversations ?? [])
    .filter(
      (c) =>
        !isTestById.get(
          c.participant_a === user.id ? c.participant_b : c.participant_a
        )
    )
    // Sort by excitement, highest first; unscored conversations fall to the end.
    .sort(
      (a, b) =>
        (b.excitement_score ?? -1) - (a.excitement_score ?? -1)
    );

  // Last-message-at per conversation — drives the "most recent active"
  // sort in the dashboard ConversationsList filter.
  const realConvIds = realConversations.map((c) => c.id);
  const lastMsgByConv = new Map<string, string>();
  if (realConvIds.length > 0) {
    const { data: latestMsgs } = await service
      .from("messages")
      .select("conversation_id, sent_at")
      .in("conversation_id", realConvIds)
      .order("sent_at", { ascending: false });
    for (const m of (latestMsgs ?? []) as any[]) {
      if (!lastMsgByConv.has(m.conversation_id)) {
        lastMsgByConv.set(m.conversation_id, m.sent_at);
      }
    }
  }
  const testConversations = (conversations ?? []).filter((c) =>
    isTestById.get(
      c.participant_a === user.id ? c.participant_b : c.participant_a
    )
  );

  // For Sync %: count REAL conversations + accepted agreements.
  // Previously we only counted conversations.status === "closed", but that
  // status field is rarely set even after sealed agreements + long
  // exchanges — so a user with 3 sealed deals saw "Conversations had: 0/15"
  // while "Sealed agreements: 18/18" was maxed. The fix: count any
  // conversation where the user has actually sent ≥1 message. That's the
  // strongest possible signal of "a real conversation happened".
  const { data: myMessageConvs } = await service
    .from("messages")
    .select("conversation_id")
    .eq("sender_user_id", user.id);
  const completedConvIds = Array.from(
    new Set(
      ((myMessageConvs ?? []) as Array<{ conversation_id: string }>).map(
        (m) => m.conversation_id
      )
    )
  );
  const { count: acceptedAgreementsCount } = await service
    .from("agreement_responses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("response", "accepted");

  // Edits captured — every time the user corrected a draft. Drives the
  // "edits captured" bucket in the Sync %.
  const { count: editCount } = await service
    .from("edit_deltas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Status pills per conversation: sealed / your-turn / waiting / negotiating.
  // Pull all agreement_responses for the user's conversations once.
  const convIds = (conversations ?? []).map((c) => c.id);
  type AgrResp = { conversation_id: string; user_id: string; response: string };
  const { data: allResps } = convIds.length
    ? await service
        .from("agreement_responses")
        .select("conversation_id, user_id, response")
        .in("conversation_id", convIds)
    : { data: [] as AgrResp[] };
  const respsByConv = new Map<string, AgrResp[]>();
  for (const r of (allResps ?? []) as AgrResp[]) {
    const list = respsByConv.get(r.conversation_id) ?? [];
    list.push(r);
    respsByConv.set(r.conversation_id, list);
  }
  function statusForConv(c: {
    id: string;
    participant_a: string;
    participant_b: string;
  }):
    | { kind: "sealed"; label: string; color: string }
    | { kind: "your_turn"; label: string; color: string }
    | { kind: "waiting"; label: string; color: string }
    | { kind: "negotiating"; label: string; color: string }
    | null {
    const rs = respsByConv.get(c.id) ?? [];
    const mine = rs.find((r) => r.user_id === user!.id);
    const otherId =
      c.participant_a === user!.id ? c.participant_b : c.participant_a;
    const theirs = rs.find((r) => r.user_id === otherId);
    if (mine?.response === "accepted" && theirs?.response === "accepted") {
      return { kind: "sealed", label: "✓ deal sealed", color: "var(--green)" };
    }
    if (theirs?.response === "accepted" && !mine) {
      return {
        kind: "your_turn",
        label: "→ your turn",
        color: "var(--amber-bright)"
      };
    }
    if (mine?.response === "accepted" && !theirs) {
      const otherName = nameById.get(otherId) ?? "them";
      return {
        kind: "waiting",
        label: `⏳ waiting on ${otherName.split(/\s+/)[0]}`,
        color: "var(--text-dim)"
      };
    }
    if (rs.length > 0) {
      return {
        kind: "negotiating",
        label: "↻ negotiating",
        color: "var(--text-dim)"
      };
    }
    return null;
  }

  // Backfill any conversation missing a summary or excitement score.
  const needsBackfillIds = (conversations ?? [])
    .filter(
      (c) =>
        !isTestById.get(
          c.participant_a === user.id ? c.participant_b : c.participant_a
        ) &&
        (c.summary == null || c.excitement_score == null)
    )
    .map((c) => c.id);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  // SyncMeter now lives INSIDE AppShell's sidebar so every signed-in
  // page renders it identically. The legacy syncInputs + cloneSyncCard
  // below are kept ONLY for the hidden legacy left-rail block (so the
  // dashboard's old layout proxy keeps building) — they don't reach
  // the user.
  const syncInputs = {
    name: myProfile?.display_name ?? null,
    goals: twin?.goals ?? null,
    ai_export_blob: twin?.ai_export_blob ?? null,
    deal_preferences: twin?.deal_preferences ?? null,
    comm_style: twin?.communication_style ?? null,
    deal_breakers: twin?.deal_breakers ?? null,
    hometown: (twin as any)?.hometown ?? null,
    current_city: (twin as any)?.current_city ?? null,
    completed_conversations: completedConvIds.length,
    accepted_agreements: acceptedAgreementsCount ?? 0,
    edit_count: editCount ?? 0
  };
  // ── Command Center header + feed (real numbers only) ──────────────────────
  const syncPct = computeSyncScore(syncInputs).total;
  const firstName =
    ((myProfile?.display_name as string) || user.email?.split("@")[0] || "there")
      .split(/\s+/)[0];
  const hr = new Date().getHours();
  const greetPart = hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";
  const ccConversations = realConversations.length;
  const ccProposals = realConversations.filter(
    (c: any) => (c.summary ?? "").toString().trim().length > 0
  ).length;
  const commandFeed = [
    { icon: "💬", label: "Conversations", value: ccConversations, href: "/messages", tint: "#5b5bf5" },
    { icon: "🤝", label: "Proposals landed", value: ccProposals, href: "/messages", tint: "#0f9d6b" },
    { icon: "💌", label: "Referrals", value: completedReferrals, href: "/invite", tint: "#e0526a" },
    { icon: "✨", label: "Twin sync", value: `${syncPct}%`, href: "/onboarding", tint: "#8b5cf6" }
  ];
  // AI Recommendation hero — the user's highest-sync real conversation right
  // now (real data via computePairScore). Null if no real conversations yet.
  const ccTop =
    realConversations
      .map((c: any) => {
        const otherId =
          c.participant_a === user.id ? c.participant_b : c.participant_a;
        const ot = (twinByUser.get(otherId) as any) ?? null;
        return {
          id: c.id as string,
          name: (nameById.get(otherId) as string) ?? "Someone",
          avatar: (avatarById.get(otherId) as string | null) ?? null,
          sync: computePairScore(twin ?? {}, ot ?? {}),
          summary: (c.summary as string | null) ?? null
        };
      })
      .sort((a, b) => b.sync - a.sync)[0] ?? null;
  // Today's Opportunities — top real users you're NOT yet talking to,
  // ranked by deterministic pair score. Reuses the already-built
  // `directory` (substance-gated, dedup'd against existing convos, fresh
  // joiners floated up). Fit pill: ≥55 High, ≥35 Medium, else Worth a look.
  const ccOpportunities = directory.slice(0, 3).map((p: any) => {
    const score = p.connection_score ?? 0;
    const tier =
      score >= 55
        ? { label: "High fit", color: "var(--green)" }
        : score >= 35
        ? { label: "Medium fit", color: "var(--amber-bright)" }
        : { label: "Worth a look", color: "var(--text-dim)" };
    // Structured About / Wants / Offers from their twin (Jack: "display
    // better info on people" — the old single headline line pulled junk).
    const t = (twinByUser.get(p.id) as any) ?? {};
    const ice = deriveIceberg({
      portfolio_about: null,
      goals: t.goals ?? p.goals ?? null,
      deal_preferences: t.deal_preferences ?? null,
      ai_export_blob: t.ai_export_blob ?? null
    });
    return {
      id: p.id as string,
      name: (p.display_name as string) || (p.email as string) || "Someone",
      avatar: (p.avatar_url as string | null) ?? null,
      score,
      tier,
      about: ice.about,
      wants: ice.wants,
      offers: ice.offers
    };
  });
  // Kept as a dead reference for the hidden legacy aside below.
  const cloneSyncCard = (
    <aside
      className="flex flex-col items-center gap-3"
      style={{
        padding: 10,
        borderRadius: 14,
        background: "var(--panel-solid)",
        border: "1px solid var(--border)"
      }}
    >
      <SyncMeter
        inputs={syncInputs}
        size={120}
        avatarUrl={(myProfile as any)?.avatar_url ?? null}
        userId={user.id}
      />
      <Link
        href="/onboarding"
        className="retro-btn retro-btn-primary text-center"
        style={{
          width: "100%",
          fontSize: 12,
          padding: "8px 10px"
        }}
      >
        + add context
      </Link>
    </aside>
  );

  return (
    <AppShell>
      {/* Fire-and-forget backfill for missing summaries/scores */}
      <SummaryBackfill conversationIds={needsBackfillIds} />
      {/* Scrolls to top when arriving with ?saved=1 (post-onboarding). */}
      <ScrollTopOnSaved />

      <>
        {/* COMMAND CENTER header + feed — Jack's rebrand. Real numbers only. */}
        <section className="mt-2">
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--amber-bright)"
            }}
          >
            Command Center
          </div>
          <h1
            className="retro-h1"
            style={{ fontSize: 30, fontWeight: 850, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Good {greetPart}, {firstName}.
          </h1>
          <p style={{ color: "var(--text-dim)", marginTop: 2, fontSize: 15 }}>
            Your twin is scanning, prioritizing, and opening doors.
          </p>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14
            }}
          >
            {commandFeed.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="retro-panel retro-panel-hover"
                style={{
                  padding: 16,
                  textDecoration: "none",
                  color: "var(--text)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    background: `${c.tint}1f`
                  }}
                  aria-hidden
                >
                  {c.icon}
                </span>
                <div style={{ fontSize: 28, fontWeight: 850, lineHeight: 1 }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>
                  {c.label}
                </div>
              </Link>
            ))}
          </div>

          {ccTop && (
            <Link
              href={`/conversations/${ccTop.id}`}
              className="retro-panel retro-panel-hover"
              style={{
                display: "flex",
                gap: 18,
                alignItems: "center",
                padding: 20,
                marginTop: 14,
                textDecoration: "none",
                color: "var(--text)",
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.07), rgba(139,92,246,0.07))",
                borderColor: "var(--amber)"
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--amber-bright)",
                    marginBottom: 6
                  }}
                >
                  ✦ AI recommendation · top priority
                </div>
                <div style={{ fontSize: 22, fontWeight: 850, letterSpacing: "-0.01em" }}>
                  {ccTop.name}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-dim)",
                    marginTop: 6,
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }}
                >
                  {ccTop.summary ||
                    "Your twin flagged this as your highest-leverage conversation. Open it and lock the next step."}
                </div>
                <div style={{ marginTop: 12, display: "inline-flex", gap: 16, fontSize: 13 }}>
                  <span style={{ color: "var(--green)", fontWeight: 800 }}>
                    {ccTop.sync}% fit
                  </span>
                  <span style={{ color: "var(--amber-bright)", fontWeight: 700 }}>
                    Open conversation →
                  </span>
                </div>
              </div>
              <Avatar
                id={ccTop.id}
                name={ccTop.name}
                avatarUrl={ccTop.avatar}
                size={84}
              />
            </Link>
          )}

          {/* TODAY'S OPPORTUNITIES — top real matches not yet in a
              conversation. Real pair scores; one-tap "connect" via the
              startConversationWithUser server action. */}
          {ccOpportunities.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--amber-bright)",
                  marginBottom: 12
                }}
              >
                Today's opportunities
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 14
                }}
              >
                {ccOpportunities.map((o) => (
                  <div
                    key={o.id}
                    className="retro-panel"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12
                      }}
                    >
                      <Avatar
                        id={o.id}
                        name={o.name}
                        avatarUrl={o.avatar}
                        size={44}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            letterSpacing: "-0.01em",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {o.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: o.tier.color,
                            letterSpacing: "0.02em"
                          }}
                        >
                          {o.score}% · {o.tier.label}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 36 }}>
                      {([
                        { label: "About", value: o.about },
                        { label: "Wants / needs", value: o.wants },
                        { label: "Offers", value: o.offers }
                      ] as { label: string; value: string | null }[])
                        .filter((r) => r.value)
                        .map((r) => (
                          <div key={r.label}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--text-dim)"
                              }}
                            >
                              {r.label}:{" "}
                            </span>
                            <span
                              style={{
                                fontSize: 12.5,
                                color: "var(--text)",
                                lineHeight: 1.4
                              }}
                            >
                              {(r.value as string).length > 110
                                ? `${(r.value as string).slice(0, 110).trim()}…`
                                : r.value}
                            </span>
                          </div>
                        ))}
                      {!o.about && !o.wants && !o.offers && (
                        <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontStyle: "italic" }}>
                          Twin still forming.
                        </span>
                      )}
                    </div>
                    <form action={startConversationWithUser}>
                      <input type="hidden" name="userId" value={o.id} />
                      <button
                        type="submit"
                        className="retro-btn retro-btn-primary"
                        style={{
                          width: "100%",
                          fontSize: 13,
                          padding: "9px 12px"
                        }}
                      >
                        Connect →
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {!twinComplete && (
          <div
            className="mt-6 retro-panel p-4 text-sm"
            style={{ borderColor: "var(--amber)" }}
          >
            <span className="retro-amber font-semibold">! </span>
            Your twin is incomplete.{" "}
            <Link href="/onboarding" className="retro-amber underline">
              Finish onboarding
            </Link>{" "}
            so it has enough context to represent you.
          </div>
        )}

        {/* Single-column main content. The Clone Sync widget lives in
            the sidebar column now (via AppShell's sidebarExtra slot),
            so the right column is full-width. */}
        <div className="mt-6">
        {/* Hidden legacy left-rail block kept for layout-equiv. */}
        <aside className="hidden" aria-hidden="true">
          <SyncMeter
            inputs={syncInputs}
            size={150}
            avatarUrl={(myProfile as any)?.avatar_url ?? null}
            userId={user.id}
          />
          <Link
            href="/onboarding"
            className="retro-btn retro-btn-primary w-full text-center"
          >
            + add context
          </Link>
          <div
            className="retro-dim text-xs text-center"
            style={{ maxWidth: 240 }}
          >
            Sync your clone to{" "}
            <span style={{ color: "var(--amber-bright)", fontWeight: 700 }}>
              99%
            </span>
            . The last 1% is on purpose — a twin is never truly finished.
          </div>
        </aside>

        {/* RIGHT — main content. Order per Jack: Your conversations
            FIRST (the highest-value daily destination — these are the
            real outcomes the user came back for), then DiscoverSearch
            (Already on SyncedIn + Find people) below it. */}
        <div className="space-y-8">

          {/* Real conversations — handed off to a client component
              that exposes a SYNC SCORE header, the (i) tooltip, the
              filter dropdown (excitement / sync / recent active /
              recent convo), and per-row SocialIconRow buttons. */}
          {realConversations.length > 0 && (() => {
            const rows: ConversationRow[] = realConversations.map((c) => {
              const otherId =
                c.participant_a === user.id
                  ? c.participant_b
                  : c.participant_a;
              const otherTwin = (twinByUser.get(otherId) as any) ?? null;
              const sync_score = computePairScore(twin ?? {}, otherTwin ?? {});
              return {
                id: c.id,
                other_id: otherId,
                other_name: nameById.get(otherId) ?? "Unknown",
                other_avatar: avatarById.get(otherId) ?? null,
                other_socials: socialsById.get(otherId) ?? null,
                other_last_active_at: lastActiveById.get(otherId) ?? null,
                status: statusForConv(c),
                counterpart_summary: c.counterpart_summary ?? null,
                summary: c.summary ?? null,
                created_at: c.created_at,
                excitement_score: c.excitement_score ?? null,
                excitement_locked: c.excitement_locked ?? null,
                sync_score,
                sync_score_override: (c as any).sync_score_override ?? null,
                last_message_at: lastMsgByConv.get(c.id) ?? null
              };
            });
            return <ConversationsList rows={rows} />;
          })()}

          {/* Sample twins */}
          {twinComplete && (testPersonas?.length ?? 0) > 0 && (
        <section>
          <div className="retro-label">test against a sample twin</div>
          <p className="mt-1 retro-dim text-xs">
            Pre-built twins that auto-reply. Stress-test yours before bringing
            real people in.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {(testPersonas ?? []).map((p) => (
              <form action={startTestConversation} key={p.id}>
                <input type="hidden" name="personaId" value={p.id} />
                <button
                  type="submit"
                  className="w-full text-left retro-panel retro-panel-hover p-3"
                >
                  <div className="font-semibold text-sm">
                    {p.display_name ?? p.email}
                  </div>
                  <div className="retro-dim text-[11px] mt-1 line-clamp-2">
                    {personaGoal.get(p.id) || ""}
                  </div>
                </button>
              </form>
            ))}
          </div>
          {testConversations.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {testConversations.map((c) => {
                const otherId =
                  c.participant_a === user.id
                    ? c.participant_b
                    : c.participant_a;
                return (
                  <Link
                    key={c.id}
                    href={`/conversations/${c.id}`}
                    className="block retro-panel retro-panel-hover px-3 py-2 text-xs"
                  >
                    <span className="retro-dim">resume: </span>
                    {nameById.get(otherId) ?? "Unknown"}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

          {/* DiscoverSearch — Already on SyncedIn directory + Find
              people twin-search. Lifted below the conversations list
              so the user's existing relationships are the first thing
              they see on the dashboard. */}
          <DiscoverSearch key={user.id} directory={directory} userId={user.id} defaultLocation={twin?.current_city || twin?.hometown || ""} />

          {/* Premium-unlock progress — 3 completed referrals = Premium
              free. completedReferrals computed up top so the build
              doesn't trip on an async-IIFE-inside-JSX pattern. */}
          <PremiumProgressCard
            completedReferrals={completedReferrals}
          />

          {/* Invite */}
          <section>
            <BulkReachToolkit appUrl={appUrl} variant="card" />
          </section>

          {/* Always-visible feedback capture. Tag with surface so we know
              this came from the main dashboard (vs. a mobile drawer or
              the conversation page) when we read the feedback table. */}
          <QuickFeedbackWidget surface="dashboard" />
        </div>
        </div>
      </>
    </AppShell>
  );
}
