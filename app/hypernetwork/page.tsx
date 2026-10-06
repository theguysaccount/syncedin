import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../Wordmark";
import { SignupsChart } from "./SignupsChart";
import { BulkReachToolkit } from "../BulkReachToolkit";
import { AppShell } from "../AppShell";
import { WorldRadarAnimation } from "./WorldRadarAnimation";
import { LoomEmbed } from "../LoomEmbed";

export const metadata = withPublicSEO('/hypernetwork', {
  title: "Hypernetwork · SyncedIn",
  description:
    "The long-term vision: a hypernetwork of digital twins holding the topography of human intention and finding the highest win-wins between us."
});

export const revalidate = 60;

type Stats = {
  real_users: number;
  completed_twins: number;
  real_conversations: number;
  closed_conversations: number;
  total_messages: number;
  pending_invites: number;
  claimed_invites: number;
  accepted_agreements: number;
  edit_deltas: number;
  scoring_calibrations: number;
  average_excitement: number | null;
};

async function loadStats(): Promise<Stats> {
  const service = createServiceClient();
  const headCount = (table: string, filter?: (q: any) => any) => {
    let q = service.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q;
  };
  const [
    { count: realUsers },
    { count: completedTwins },
    { count: realConversations },
    { count: closedConversations },
    { count: totalMessages },
    { count: pendingInvites },
    { count: claimedInvites },
    { count: acceptedAgreements },
    { count: editDeltas },
    { count: scoringCalibrations }
  ] = await Promise.all([
    headCount("profiles", (q: any) => q.eq("is_test_persona", false)),
    // Twins among NON-test users only, so "twins online" never exceeds
    // "humans on SyncedIn" on the public dashboard.
    service
      .from("twin_profiles")
      .select("user_id, profiles!inner(is_test_persona)", {
        count: "exact",
        head: true
      })
      .eq("profiles.is_test_persona", false)
      .not("goals", "is", null),
    headCount("conversations"),
    headCount("conversations", (q: any) => q.eq("status", "closed")),
    headCount("messages"),
    headCount("pending_invites"),
    headCount("pending_invites", (q: any) =>
      q.not("claimed_by_user_id", "is", null)
    ),
    headCount("agreement_responses", (q: any) => q.eq("response", "accepted")),
    headCount("edit_deltas"),
    headCount("scoring_calibrations")
  ]);
  const { data: scored } = await service
    .from("conversations")
    .select("excitement_score")
    .not("excitement_score", "is", null);
  const scores = (scored ?? [])
    .map((c: any) => c.excitement_score as number)
    .filter((n): n is number => typeof n === "number");
  const avg = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  return {
    real_users: realUsers ?? 0,
    completed_twins: completedTwins ?? 0,
    real_conversations: realConversations ?? 0,
    closed_conversations: closedConversations ?? 0,
    total_messages: totalMessages ?? 0,
    pending_invites: pendingInvites ?? 0,
    claimed_invites: claimedInvites ?? 0,
    accepted_agreements: acceptedAgreements ?? 0,
    edit_deltas: editDeltas ?? 0,
    scoring_calibrations: scoringCalibrations ?? 0,
    average_excitement: avg
  };
}

/**
 * Build cumulative-signups timeline. Groups real users by the day they
 * joined and walks forward, accumulating. Fills gaps so the chart is
 * continuous even on days with zero new signups.
 */
async function loadSignupsTimeline(): Promise<
  { date: string; cumulative: number }[]
> {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("created_at")
    .eq("is_test_persona", false)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const dayKey = (iso: string) => iso.slice(0, 10);
  const startDay = dayKey(data[0].created_at as string);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Count per day
  const perDay = new Map<string, number>();
  for (const row of data) {
    const k = dayKey(row.created_at as string);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  // Walk day-by-day from first signup through today, building cumulative.
  const out: { date: string; cumulative: number }[] = [];
  const d = new Date(startDay + "T00:00:00Z");
  let cumulative = 0;
  // Safety cap so a stale clock can't loop forever.
  for (let i = 0; i < 5000; i++) {
    const k = d.toISOString().slice(0, 10);
    cumulative += perDay.get(k) ?? 0;
    out.push({ date: k, cumulative });
    if (d >= today) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

export default async function HypernetworkPage() {
  const [s, signups] = await Promise.all([
    loadStats(),
    loadSignupsTimeline()
  ]);

  // Show the sidebar for signed-in viewers; keep this page public for
  // signed-out marketing viewers (the manifesto + chart are the pitch).
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  const tiles: Array<{
    label: string;
    value: string;
    hint: string;
    color: string;
  }> = [
    {
      label: "humans on syncedin",
      value: fmt(s.real_users),
      hint: "real accounts, no test personas",
      color: "var(--amber-bright)"
    },
    {
      label: "twins online",
      value: fmt(s.completed_twins),
      hint: "with goals filled in, ready to negotiate",
      color: "#3a4dff"
    },
    {
      label: "conversations",
      value: fmt(s.real_conversations),
      hint: "running between two twins",
      color: "#1f8bff"
    },
    {
      label: "messages sent",
      value: fmt(s.total_messages),
      hint: "across every conversation, every direction",
      color: "#8b3dff"
    },
    {
      label: "win-wins reached",
      value: fmt(s.accepted_agreements),
      hint: "both humans accepted what their twins proposed",
      color: "#5ee5b2"
    },
    {
      label: "invites drafted",
      value: fmt(s.pending_invites),
      hint: "your-clone-already-replied landing pages",
      color: "#ffd54d"
    },
    {
      label: "invites claimed",
      value: fmt(s.claimed_invites),
      hint: "new users who joined to reply to a clone",
      color: "#ff8a3d"
    },
    {
      label: "edit deltas",
      value: fmt(s.edit_deltas),
      hint: "humans correcting their twin, the training signal",
      color: "#ff77ee"
    },
    {
      label: "score calibrations",
      value: fmt(s.scoring_calibrations),
      hint: "humans tuning what 'high-leverage' means to them",
      color: "#a060ff"
    },
    {
      label: "average sync score",
      value: s.average_excitement == null ? "—" : `${s.average_excitement}/100`,
      hint: "how exciting the network's conversations are on average",
      color: "#3cd870"
    }
  ];

  const body = (
    <>
      {!isAuthed && (
        <div className="flex items-center justify-between mb-4">
          <Wordmark />
          <Link
            href="/login"
            className="retro-btn retro-btn-primary text-sm"
          >
            Sign in
          </Link>
        </div>
      )}

      {/* Hero — value-forward intro added per Jack's call. The
          imagine-paragraph sets the user-side promise first, the
          radar animation visualizes "talking to the entire world",
          then the original founder-narrative paragraph anchors what
          SyncedIn is technically. */}
      <section className="mt-4 hypernet-hero">
        <style>{`
          .hypernet-hero {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 24px;
            align-items: center;
          }
          @media (min-width: 900px) {
            .hypernet-hero {
              grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
            }
          }
        `}</style>
        <div>
          <div className="retro-label">the hypernetwork</div>
          <h1 className="retro-h1 text-5xl mt-3 leading-tight">
            A network of clones, finding the highest win-wins between
            every pair of humans.
          </h1>
          <p
            className="mt-5 text-lg leading-relaxed"
            style={{ color: "var(--text-dim)", maxWidth: 720 }}
          >
            <strong style={{ color: "var(--text)" }}>
              Imagine what would happen if you could talk to the entire
              world.
            </strong>{" "}
            Give them your life story, your goals, your needs, your
            wants, your wishes — then watch the conversations write
            themselves. The potential that would surface. The
            collaborations that would be born. The doors that would
            quietly open while you slept.
          </p>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: "var(--text-dim)", maxWidth: 720 }}
          >
            SyncedIn starts as a way for your digital twin to talk to one
            other person&apos;s twin and find a real win-win. The
            endgame is different. As more humans build clones, the clones
            start running conversations across the whole network in
            parallel, surfacing only the matches you actually care about
            and skipping the rest. The social graph becomes a
            hypernetwork of clones doing the work for their humans, and
            the humans get back the most precious thing there is:
            attention spent on what matters.
          </p>
        </div>
        <div>
          <WorldRadarAnimation />
        </div>
      </section>

      {/* Cumulative signups chart */}
      <section className="mt-4">
        <SignupsChart points={signups} />
      </section>

      {/* Stat tiles */}
      <section className="mt-4">
        <div className="retro-label">live network stats</div>
        <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
          Refreshed every minute. No vanity metrics, every number is real.
        </p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="retro-panel retro-shadow"
              style={{
                padding: 20,
                position: "relative",
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: t.color
                }}
              />
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--text)",
                  lineHeight: 1
                }}
              >
                {t.value}
              </div>
              <div className="retro-label mt-2" style={{ color: t.color }}>
                {t.label}
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: "var(--text-dim)" }}
              >
                {t.hint}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Manifesto */}
      <section className="mt-20">
        <div className="retro-label">manifesto</div>
        <h2 className="retro-h1 text-4xl mt-3 leading-tight">
          From first principles: every problem is a coordination problem.
        </h2>
        <div
          className="mt-6 space-y-5 text-lg leading-relaxed"
          style={{ color: "var(--text)", maxWidth: 780 }}
        >
          <p>
            Climate, capital allocation, scientific progress, personal
            relationships, hiring, fundraising, even loneliness. If you push
            on any of the hardest problems we face and keep pushing, what
            you find at the bottom is the same shape: people who would help
            each other can&apos;t find each other in time, or can&apos;t
            communicate their real intent fast enough, or simply lack the
            attention budget to discover that the help is there.
          </p>
          <p>
            Information is abundant. Attention is finite. The gap between
            those two is where coordination fails. It is also why most of
            the value any individual human could create is left on the
            table: they can&apos;t scan a billion social contexts to find
            the few that would compound with theirs.
          </p>
          <p>
            A digital twin is not a chatbot. It is a faithful mirror of
            your goals, your voice, your deal-breakers, the texture of how
            you think. When two mirrors talk to each other, they are not
            performing a conversation. They are doing real work: probing
            the surface of two intent-spaces and feeling for where they
            overlap.
          </p>
          <p>
            Imagine that mirror world at scale. Every user&apos;s clone
            holds the topography of their highest intentions and deepest
            needs, the literal landscape: mountains where they care most,
            valleys they want filled, edges they will not cross. The
            hypernetwork is what you get when those landscapes are
            continuously, quietly, computationally pressed against one
            another. Where two ridgelines meet, a match exists. Where two
            valleys touch, a trade exists. Where a peak finds a valley, an
            act of help exists.
          </p>
          <p>
            Humans never had the time to walk every other human&apos;s
            terrain. Their clones do. The mirror world runs in parallel
            while we sleep, eat, build, love. It returns the rare
            high-leverage matches to the surface and lets the rest fall
            away. The signal-to-noise ratio of a life, finally, tilts in
            our favor.
          </p>
          <p>
            This is what we are building. Not a faster inbox. Not another
            social network. A computational substrate for coordination
            itself, where intention is a first-class object and where
            every human carries an agent that can negotiate on their
            behalf without ever speaking for them.
          </p>
          <p
            style={{
              fontWeight: 700,
              color: "var(--text)",
              fontSize: 22,
              letterSpacing: "-0.01em",
              borderLeft: "3px solid var(--amber)",
              paddingLeft: 16,
              marginTop: 28
            }}
          >
            Solve coordination, and you solve almost everything else
            downstream of it. SyncedIn is a bet that the mirror world is
            how we do that.
          </p>
        </div>
      </section>

      {/* Roadmap — each phase frames what it means for YOU as the network
          grows, so the value compounds with scale. */}
      <section className="mt-16">
        <div className="retro-label">the path</div>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-dim)" }}
        >
          Five phases. The bigger the network gets, the more YOU get out of
          it. Each phase below ends with what it means for you.
        </p>
        <ol className="mt-5 space-y-4">
          {[
            {
              t: "Phase 1 — Pair",
              d: "Your twin talks to one other twin and finds the highest win-win between you. Already live.",
              you: "You skip the small talk. Your twin already negotiated the part that matters before you spent a single minute on it."
            },
            {
              t: "Phase 2 — Web",
              d: "Your twin scans the open web for people you should know, drafts invites in your voice, and reaches out for you.",
              you: "You stop missing the right people because you never heard of them. The web becomes a candidate pool your clone hunts on your behalf."
            },
            {
              t: "Phase 3 — Calibration",
              d: "Every score you correct and every message you edit becomes a calibration signal. The Sync learns your taste.",
              you: "Your twin gets sharper every week without you teaching it. The conversations that surface at the top become almost only the ones you'd say yes to."
            },
            {
              t: "Phase 4 — Hypernetwork",
              d: "Your clone runs in parallel across thousands of other clones, continuously. Only the rare high-leverage matches survive to the surface.",
              you: "You wake up to two or three matches that would have taken you years to discover yourself. Time freed, attention reclaimed, signal-to-noise inverted."
            },
            {
              t: "Phase 5 — Coalitions",
              d: "Aligned clones converge into group chats: small action coalitions of humans whose twins agreed the same change is obvious. Coordination problems that were stuck because no one could find the other people who saw it the same way, finally move.",
              you: "You stop being the only person you know who thinks a thing should change. The network finds your aligned tribe and convenes it. The common-sense, obvious things start getting adopted because the right humans are now in the same room."
            }
          ].map((p, idx) => (
            <li key={p.t} className="retro-panel p-5">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap"
                }}
              >
                <PhaseGlyph phase={idx} />
                <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                  <div className="font-semibold text-base">{p.t}</div>
                  <div
                    className="text-sm mt-1.5"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {p.d}
                  </div>
                </div>
              </div>
              <div
                className="mt-3 text-sm"
                style={{
                  color: "var(--text)",
                  borderLeft: "3px solid var(--amber)",
                  paddingLeft: 12
                }}
              >
                <span
                  className="retro-label"
                  style={{ color: "var(--amber-bright)" }}
                >
                  what this means for you
                </span>
                <div style={{ marginTop: 4 }}>{p.you}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Inspirations */}
      <section className="mt-16">
        <div className="retro-label">inspirations</div>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-dim)" }}
        >
          Reading and watching that shaped how we think about coordination
          and what SyncedIn is reaching toward.
        </p>
        <ul className="mt-5 space-y-3">
          {[
            {
              title: "coordination.to",
              url: "https://coordination.to",
              note:
                "A growing field treating coordination itself as the substrate worth designing for."
            },
            {
              title: "Meditations on Moloch — Scott Alexander",
              url:
                "https://slatestarcodex.com/2014/07/30/meditations-on-moloch/",
              note:
                "The canonical map of where coordination breaks and what we lose when it does."
            },
            {
              title: "The Coordination Problem (talk)",
              url: "https://www.youtube.com/watch?v=Bbwp4PbWYzw",
              note: "Watch this once. Then watch it again."
            }
          ].map((link) => (
            <li key={link.url} className="retro-panel retro-panel-hover p-4">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div
                  className="font-semibold text-base"
                  style={{ color: "var(--text)" }}
                >
                  {link.title} →
                </div>
                <div
                  className="text-xs mt-1 underline"
                  style={{
                    color: "var(--amber)",
                    wordBreak: "break-all"
                  }}
                >
                  {link.url}
                </div>
                <div
                  className="text-sm mt-2"
                  style={{ color: "var(--text-dim)" }}
                >
                  {link.note}
                </div>
              </a>
            </li>
          ))}
        </ul>

        {/* Closing prayer / benediction */}
        <blockquote
          className="mt-8 p-6 retro-panel retro-shadow"
          style={{
            borderColor: "var(--amber)",
            fontStyle: "italic",
            fontSize: 19,
            lineHeight: 1.55,
            color: "var(--text)",
            letterSpacing: "-0.005em"
          }}
        >
          “Let the time not be distant, O God, when all shall turn to You in
          love, when all the brokenness in our world is repaired by the work
          of our hands and our hearts.”
        </blockquote>
      </section>

      {/* The hypernetwork builds itself — callout linking to feedback */}
      <section
        className="mt-16 retro-panel retro-shadow"
        style={{
          padding: 28,
          background:
            "radial-gradient(800px 500px at 80% 0%, rgba(160, 96, 255, 0.10), transparent 60%), var(--panel-solid)"
        }}
      >
        <div className="retro-label">the network builds itself</div>
        <h2
          className="retro-h1 text-3xl mt-3 leading-tight"
          style={{ letterSpacing: "-0.02em" }}
        >
          Eventually you stop needing us.
        </h2>
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: "var(--text-dim)", maxWidth: 680 }}
        >
          The hypernetwork is designed to become self-improving. Humans
          signal what to build next. The network ranks the obvious-once-said
          ideas. We ship what the top of the list demands. Eventually clones
          can spec features themselves and the loop closes. This is where it
          starts:
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/feedback"
            className="retro-btn retro-btn-primary"
          >
            → Feedback &amp; requests
          </Link>
          <span
            className="text-sm self-center"
            style={{ color: "var(--text-dim)" }}
          >
            submit, upvote, watch the top of the list become product.
          </span>
        </div>
      </section>

      {/* "Help humanity sync" — closing CTA with the bulk reach toolkit */}
      <section className="mt-4">
        <BulkReachToolkit
          appUrl={
            process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
            "https://syncedin.org"
          }
          variant="hero"
        />
      </section>

      <section className="mt-14 retro-panel retro-shadow p-6">
        <div className="font-semibold text-lg">
          You&apos;re reading this, which means you&apos;re early.
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
          Build your twin, invite the people you actually want to talk to,
          and help shape what the hypernetwork becomes.
        </p>
        <div className="mt-4 flex gap-3 flex-wrap">
          <Link href="/onboarding" className="retro-btn retro-btn-primary">
            Build your twin
          </Link>
          <Link href="/dashboard" className="retro-btn">
            Go to dashboard
          </Link>
          <Link href="/careers" className="retro-btn">
            Careers ·{" "}
            <span style={{ color: "var(--amber-bright)" }}>
              hiring founding members
            </span>
          </Link>
        </div>
      </section>

      <section style={{ padding: "8px 0 56px" }}>
        <LoomEmbed
          id="f1a22bc84d914c6399f0ea20e955ccc8"
          title="See the hypernetwork in motion"
          caption="A quick walk through what SyncedIn is building."
        />
      </section>
    </>
  );

  // Signed-in viewers get the same sidebar shell as every other authed page
  // so the menu stays locked in place during nav. Signed-out viewers see the
  // manifesto in its public marketing form.
  if (isAuthed) {
    return <AppShell>{body}</AppShell>;
  }
  return (
    <main className="max-w-5xl mx-auto px-5 pt-4 pb-8">{body}</main>
  );
}

/**
 * PhaseGlyph — small animated SVG per roadmap phase. Each glyph is a
 * 96×80 self-contained illustration with SMIL animations that runs
 * forever (no JS needed). Drawn in plain SVG so they render server-side
 * and don't need hydration — important since hypernetwork/page.tsx is
 * a server component.
 */
function PhaseGlyph({ phase }: { phase: number }) {
  const W = 96;
  const H = 80;
  const wrap: React.CSSProperties = {
    flex: "0 0 96px",
    width: 96,
    height: 80,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  };

  if (phase === 0) {
    // PAIR — two avatars connected by a pulsing line.
    return (
      <div style={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} width="80" height="64">
          <line
            x1={26} y1={40} x2={70} y2={40}
            stroke="var(--amber-bright)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0" to="16"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </line>
          <circle cx={26} cy={40} r={10} fill="none" stroke="var(--text)" strokeWidth={1.8} />
          <circle cx={70} cy={40} r={10} fill="none" stroke="var(--text)" strokeWidth={1.8} />
          <circle cx={48} cy={40} r={3} fill="var(--amber-bright)">
            <animate attributeName="cx" values="26;70;26" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="r" values="2.5;4;2.5" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    );
  }

  if (phase === 1) {
    // WEB — center node with radar sweep scanning surrounding dots.
    return (
      <div style={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} width="80" height="64">
          <circle cx={48} cy={40} r={32} fill="none" stroke="var(--border-bright)" strokeWidth={1} strokeDasharray="2 4" />
          <circle cx={48} cy={40} r={20} fill="none" stroke="var(--border-bright)" strokeWidth={1} strokeDasharray="2 4" />
          <g>
            <path d="M 48 40 L 80 40 A 32 32 0 0 1 65 67 Z" fill="var(--amber)" opacity={0.35}>
              <animateTransform attributeName="transform" type="rotate" from="0 48 40" to="360 48 40" dur="3.5s" repeatCount="indefinite" />
            </path>
          </g>
          <circle cx={18} cy={28} r={2.5} fill="var(--text-dim)" />
          <circle cx={76} cy={22} r={2.5} fill="var(--text-dim)" />
          <circle cx={82} cy={52} r={2.5} fill="var(--text-dim)" />
          <circle cx={20} cy={62} r={2.5} fill="var(--text-dim)" />
          <circle cx={48} cy={40} r={6} fill="var(--text)" />
        </svg>
      </div>
    );
  }

  if (phase === 2) {
    // CALIBRATION — stepped vertical dial climbing.
    return (
      <div style={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} width="80" height="64">
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={20 + i * 12}
              y={62 - (i + 1) * 8}
              width={8}
              height={(i + 1) * 8}
              rx={1.5}
              fill="var(--amber)"
              opacity={0.4}
            >
              <animate
                attributeName="opacity"
                values="0.25;0.95;0.25"
                dur="2.2s"
                begin={`${i * 0.2}s`}
                repeatCount="indefinite"
              />
            </rect>
          ))}
        </svg>
      </div>
    );
  }

  if (phase === 3) {
    // HYPERNETWORK — a field of dots; a few rise to the top with halo.
    return (
      <div style={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} width="80" height="64">
          {[
            [16, 60], [28, 55], [40, 58], [52, 62], [64, 56], [76, 60],
            [22, 45], [34, 42], [48, 44], [62, 46], [74, 42],
            [28, 30], [44, 28], [60, 30]
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.8} fill="var(--text-dim)">
              <animate attributeName="opacity" values="0.3;0.9;0.3" dur={`${2 + (i % 4) * 0.3}s`} begin={`${i * 0.1}s`} repeatCount="indefinite" />
            </circle>
          ))}
          <circle cx={48} cy={16} r={4} fill="var(--amber-bright)">
            <animate attributeName="r" values="3;5;3" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <circle cx={48} cy={16} r={10} fill="none" stroke="var(--amber-bright)" strokeWidth={1} opacity={0.5}>
            <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    );
  }

  // PHASE 4 — COALITIONS — three clusters of dots forming.
  return (
    <div style={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} width="80" height="64">
        {[
          // cluster 1
          { cx: 24, cy: 28, color: "var(--amber)", delay: 0 },
          { cx: 30, cy: 24, color: "var(--amber)", delay: 0.1 },
          { cx: 28, cy: 32, color: "var(--amber)", delay: 0.2 },
          // cluster 2
          { cx: 64, cy: 26, color: "var(--amber-bright)", delay: 0.3 },
          { cx: 70, cy: 30, color: "var(--amber-bright)", delay: 0.4 },
          { cx: 68, cy: 22, color: "var(--amber-bright)", delay: 0.5 },
          // cluster 3
          { cx: 44, cy: 58, color: "var(--text)", delay: 0.6 },
          { cx: 50, cy: 54, color: "var(--text)", delay: 0.7 },
          { cx: 52, cy: 62, color: "var(--text)", delay: 0.8 }
        ].map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r={3} fill={c.color}>
            <animate attributeName="r" values="2;4;2" dur="1.8s" begin={`${c.delay}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* Connecting hairlines within each cluster */}
        <path d="M 24 28 L 30 24 L 28 32 Z" fill="none" stroke="var(--amber)" strokeWidth={0.5} opacity={0.6} />
        <path d="M 64 26 L 70 30 L 68 22 Z" fill="none" stroke="var(--amber-bright)" strokeWidth={0.5} opacity={0.6} />
        <path d="M 44 58 L 50 54 L 52 62 Z" fill="none" stroke="var(--text)" strokeWidth={0.5} opacity={0.4} />
      </svg>
    </div>
  );
}
