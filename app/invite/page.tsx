import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";
import { BulkReachToolkit } from "../BulkReachToolkit";
import { AnimatedStat } from "../AnimatedStat";
import { countReferrals } from "@/lib/invite-stats";

export const metadata = {
  title: "Invite · SyncedIn",
  description:
    "The most context-aware invite on the internet. Drop a LinkedIn / X / Instagram / Facebook URL, an email, or a phone number — SyncedIn scrapes their public footprint, your twin writes a personal opener, and you send a one-of-one landing page they actually want to open."
};

/**
 * /invite — the deep-context invite hub.
 *
 * This page exists so the "invite a human" surface has its own dedicated
 * home in the sidebar. The dashboard has a slim version; this is the full
 * manifesto + the BulkReachToolkit at full strength.
 */
export default async function InvitePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invite");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  // Stats — pulled from this inviter's pending_invites rows. Wrapped in
  // try/catch so a missing column (e.g. visit_count before the migration
  // runs in prod) silently degrades rather than 500'ing the whole page.
  const service = createServiceClient();
  let drafted = 0;
  let claimed = 0;
  let visited = 0;
  let visitTotal = 0;
  try {
    const { count: draftedCount } = await service
      .from("pending_invites")
      .select("slug", { count: "exact", head: true })
      .eq("inviter_user_id", user.id);
    drafted = draftedCount ?? 0;
    // Unified count — strict claim ∪ email match. Same helper backs
    // /personal-intelligence and the dashboard so all three pages
    // show the same number. Jack: "stats on invite page and on the
    // actual personal intelligence unlock page... VERY DIFFERENT" —
    // previously this page added handle-prefix + ambient-growth
    // fallbacks the PI page didn't, which inflated this number ~3x.
    const referralRes = await countReferrals(user.id, { email: user.email });
    claimed = referralRes.count;
    // visit_count + first_visit_at may not exist yet in prod (schema
    // migration pending). Use a defensive try.
    try {
      const { data: visitRows } = await service
        .from("pending_invites")
        .select("visit_count, first_visit_at")
        .eq("inviter_user_id", user.id);
      for (const row of (visitRows ?? []) as any[]) {
        if ((row?.visit_count ?? 0) > 0) visited += 1;
        visitTotal += row?.visit_count ?? 0;
      }
    } catch {
      /* migration not applied yet — fall back to zeros */
    }
  } catch {
    /* totally offline / RLS issue — leave zeros */
  }
  // Daily breakdowns for the sparklines under each stat. Last 14 days,
  // zeros for empty days. Pulled separately + best-effort so any
  // missing column (claimed_at, first_visit_at) just yields a flat
  // sparkline instead of breaking the page.
  const DAYS = 14;
  const draftedDaily: number[] = Array(DAYS).fill(0);
  const visitedDaily: number[] = Array(DAYS).fill(0);
  const visitTotalDaily: number[] = Array(DAYS).fill(0);
  const claimedDaily: number[] = Array(DAYS).fill(0);
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));
    const sinceIso = since.toISOString();
    // Arrow assignment — function declaration in block fails TS strict
    // mode against the ES5 target.
    const bucket = (iso: string | null): number => {
      if (!iso) return -1;
      const d = new Date(iso);
      d.setUTCHours(0, 0, 0, 0);
      const idx = Math.round(
        (d.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)
      );
      return idx >= 0 && idx < DAYS ? idx : -1;
    };
    const { data: timelineRows } = await service
      .from("pending_invites")
      .select(
        "created_at, first_visit_at, visit_count, claimed_at, claimed_by_user_id"
      )
      .eq("inviter_user_id", user.id)
      .gte("created_at", sinceIso);
    for (const r of (timelineRows ?? []) as any[]) {
      const di = bucket(r.created_at);
      if (di >= 0) draftedDaily[di] += 1;
      const vi = bucket(r.first_visit_at);
      if (vi >= 0) {
        visitedDaily[vi] += 1;
        // Approximate per-day total visits by attributing the row's
        // accumulated visit_count to its first-visit day. Imperfect
        // (a later return visit lands in the same bucket) but good
        // enough for a sparkline shape — we capture a proper visit
        // log in a follow-up.
        visitTotalDaily[vi] += r.visit_count ?? 0;
      }
      // Claim happens on either claimed_at (if column exists) or
      // claimed_by_user_id presence. We don't have a timestamp for
      // the latter; only count rows that have a real claimed_at.
      const ci = bucket(r.claimed_at);
      if (ci >= 0) claimedDaily[ci] += 1;
    }
  } catch {
    /* daily series unavailable — sparklines render as flat lines */
  }

  const ctr =
    drafted > 0 ? Math.min(100, Math.round((visited / drafted) * 100)) : 0;
  // Clamp to 100: `claimed` includes manual bonus credit + cross-account
  // matches that aren't a strict subset of this user's drafted invites, so
  // the raw ratio can exceed 100%. A claim rate over 100% reads as a bug.
  const claimRate =
    drafted > 0 ? Math.min(100, Math.round((claimed / drafted) * 100)) : 0;

  return (
    <AppShell>
      <header className="page-heading"><div><h1>Invitations</h1><p>Good introductions start with context.</p></div></header>

      {/* THE TOOLKIT — surface the action FIRST. */}
      <section className="mt-8">
        <div className="retro-label">send invites now</div>
        <h2 className="retro-h1 text-2xl mt-2">
          Add who you want to invite.
        </h2>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--text-dim)", maxWidth: 680 }}
        >
          Each entry becomes a custom landing page at
          <code style={{ color: "var(--amber-bright)", margin: "0 4px" }}>
            syncedin.org/their-name
          </code>
          with a twin-voice opener. Then send via iMessage, Email, WhatsApp,
          or copy the link anywhere.
        </p>

        <div className="mt-6">
          <BulkReachToolkit appUrl={appUrl} variant="card" />
        </div>
      </section>

      {/* THE THREE-STEP CONTEXT GRAB — explainer moved below the toolkit
          so the action surface is what users hit first. */}
      <section className="mt-12">
        <div className="retro-label">how the context grab works</div>
        <h2 className="retro-h1 text-2xl mt-2">
          One profile URL becomes a personalized landing page.
        </h2>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--text-dim)", maxWidth: 720 }}
        >
          The recipient never sees a sign-up wall, a CTA banner, or a
          generic "what is SyncedIn." They see a page about them, written by
          your twin, ending with one question.
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-5">
          <Pillar
            k="01"
            t="You drop one signal"
            d="Paste their LinkedIn, X, Instagram, or Facebook URL. (Or email + name. Or phone + name.) That's the entire input."
          />
          <Pillar
            k="02"
            t="We scrape their public footprint"
            d="Bio, recent posts, captions, headlines. Whatever they've already put on the public internet becomes context for the opener — no guessing."
          />
          <Pillar
            k="03"
            t="Your twin writes a real opener"
            d="2-3 sentences in your voice that reference something specific from their profile. Ends with a question that makes them want to reply."
          />
        </div>
      </section>

      {/* WHY THIS IS DIFFERENT FROM EVERY OTHER INVITE */}
      <section className="mt-12">
        <div className="retro-label">why the click-through is higher</div>
        <h2 className="retro-h1 text-2xl mt-2">
          A landing page that mentions them by name. Always.
        </h2>
        <div className="mt-5 grid sm:grid-cols-2 gap-5">
          <DiffCard
            tag="every other invite"
            head="One link, generic page"
            body="Same URL for everyone. Same headline. Same CTA. Recipient feels like spam, closes it in 2 seconds."
            mood="dim"
          />
          <DiffCard
            tag="SyncedIn invite"
            head="One link, page about THEM"
            body="Title contains their name. Body opens with their specific work. Twin's opener references their actual posts. They've never seen this kind of personalization from an invite link."
            mood="amber"
          />
        </div>
      </section>

      {/* INVITER STATS — your own scoreboard. Drafted / Visited / Onboarded
          plus the early-inviter rewards promise. Sits ABOVE the closing
          "the math" block so users see their own numbers before the
          abstract pitch. */}
      <section className="mt-14">
        <div className="retro-label">your inviter scoreboard</div>
        <h2 className="retro-h1 text-2xl mt-2">
          Every link is a seed. Here are yours, growing.
        </h2>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--text-dim)", maxWidth: 700 }}
        >
          We track the entire funnel from drafted to onboarded twin.
          Inviters who bring real people in early help define the network
          — we&apos;re reserving recognition + rewards for the first
          hundred who do.
        </p>
        <div
          className="mt-5 grid sm:grid-cols-4 gap-4"
          style={{ minWidth: 0 }}
        >
          <AnimatedStat
            label="invites drafted"
            value={drafted}
            hint="every personalized invite page you've created"
            daily={draftedDaily}
          />
          <AnimatedStat
            label="recipients who clicked"
            value={visited}
            sub={drafted > 0 ? `${ctr}% click-through` : "no data yet"}
            hint="people who opened your invite page after you shared it"
            daily={visitedDaily}
            accent="#6b2dc9"
          />
          <AnimatedStat
            label="twins onboarded"
            value={claimed}
            sub={drafted > 0 ? `${claimRate}% claim rate` : "no data yet"}
            hint="recipients who signed up and seeded their own twin from your invite"
            daily={claimedDaily}
            accent="#22c55e"
          />
          <AnimatedStat
            label="total page visits"
            value={visitTotal}
            hint="reach across every invite page, including return visits"
            daily={visitTotalDaily}
            accent="#f97316"
          />
        </div>
        <div
          className="mt-5 retro-panel"
          style={{
            padding: "14px 16px",
            background:
              "radial-gradient(600px 300px at 0% 0%, rgba(94,110,255,0.10), transparent 60%), var(--panel-solid)",
            borderColor: "var(--amber)"
          }}
        >
          <div
            className="retro-label"
            style={{ color: "var(--amber-bright)" }}
          >
            early inviter rewards
          </div>
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{ color: "var(--text)", maxWidth: 760 }}
          >
            We&apos;re reserving recognition for the inviters who brought
            this network to life. The earliest people whose links bring
            new twins onboard get permanent early-builder credit,
            visibility on the hypernetwork, and first access to whatever
            we build next on top of this graph. Bring your people in
            before everyone else does.
          </p>
        </div>
      </section>

      {/* CLOSING PROMISE */}
      <section className="mt-14 mb-8">
        <div
          className="retro-panel"
          style={{
            padding: 24,
            borderColor: "var(--amber)",
            background:
              "radial-gradient(800px 500px at 50% 0%, rgba(255,184,77,0.06), transparent 60%), var(--panel-solid)"
          }}
        >
          <div
            className="retro-label"
            style={{ color: "var(--amber-bright)" }}
          >
            the math
          </div>
          <h3 className="retro-h1 text-xl mt-2">
            Every personalized invite costs you 5 seconds. Every signup
            compounds the{" "}
            <Link
              href="/hypernetwork"
              style={{
                color: "var(--amber-bright)",
                textDecoration: "underline",
                textDecorationThickness: 2,
                textUnderlineOffset: 3
              }}
            >
              hypernetwork
            </Link>
            .
          </h3>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--text-dim)", maxWidth: 720 }}
          >
            Twin onboarding is the bottleneck for everyone. The faster the
            people you want to talk to are inside SyncedIn, the faster your
            twin starts surfacing real win-wins. The fastest path: paste
            their profile URL above. Hit generate. Send the link.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

function StatTile({
  label,
  value,
  sub,
  hint
}: {
  label: string;
  value: number;
  sub?: string;
  hint?: string;
}) {
  return (
    <div
      className="retro-panel"
      style={{
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 124
      }}
      title={hint}
    >
      <div className="retro-label" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div
        className="retro-h1"
        style={{ fontSize: 32, lineHeight: 1, marginTop: 2 }}
      >
        {value.toLocaleString()}
      </div>
      {sub && (
        <div
          className="text-xs"
          style={{ color: "var(--amber-bright)", marginTop: 2 }}
        >
          {sub}
        </div>
      )}
      {hint && (
        <div
          className="text-xs"
          style={{ color: "var(--text-dim)", lineHeight: 1.4 }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Pillar({ k, t, d }: { k: string; t: string; d: string }) {
  return (
    <div className="retro-panel" style={{ padding: "20px 22px" }}>
      <div className="retro-amber text-xs font-bold">{k}</div>
      <div className="mt-2 font-semibold text-sm">{t}</div>
      <div
        className="mt-2 retro-dim text-xs"
        style={{ lineHeight: 1.6 }}
      >
        {d}
      </div>
    </div>
  );
}

function DiffCard({
  tag,
  head,
  body,
  mood
}: {
  tag: string;
  head: string;
  body: string;
  mood: "dim" | "amber";
}) {
  const isAmber = mood === "amber";
  return (
    <div
      className="retro-panel"
      style={{
        padding: 20,
        borderColor: isAmber ? "var(--amber)" : "var(--border)",
        opacity: isAmber ? 1 : 0.85
      }}
    >
      <div
        className="retro-label"
        style={{ color: isAmber ? "var(--amber-bright)" : "var(--text-dim)" }}
      >
        {tag}
      </div>
      <div
        className="font-semibold text-sm mt-2"
        style={{ color: "var(--text)" }}
      >
        {head}
      </div>
      <div
        className="mt-2 retro-dim text-xs"
        style={{ lineHeight: 1.6 }}
      >
        {body}
      </div>
    </div>
  );
}
