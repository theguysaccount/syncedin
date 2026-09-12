import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "./Wordmark";
import { LandingHandleHero } from "./LandingHandleHero";
import { LoomEmbed } from "./LoomEmbed";
import { TrackBeacon } from "./TrackBeacon";

/**
 * Public home page — completely redesigned May 2026 per Jack: "we
 * need to look more modern and elite." Replaces the retro-panel
 * cassette-futurism block with a clean white hero, social proof,
 * platform picker, and a single oversized CTA. Three-card "how it
 * works" row sits underneath for context without crowding the
 * conversion surface.
 *
 * Signed-in users still bounce to /dashboard.
 */
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  // Jack: "use real photos also on the homepage rather than these weird
  // ones next to the 40+ founders syncing thing. Use real photos of
  // people on the platform." Pull a handful of real users with an
  // actual uploaded avatar (filter out the DiceBear-default ones) so
  // the social-proof strip is genuine. Falls back to the prior dicebear
  // SVGs if the query 500s or returns nothing.
  let realFaces: Array<{
    id: string;
    name: string;
    avatar_url: string;
    handle: string | null;
  }> = [];
  try {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("profiles")
      .select("id, display_name, email, avatar_url, handle, last_active_at")
      .not("avatar_url", "is", null)
      // DiceBear / robohash / gravatar identicon fallbacks aren't "real"
      // — filter to actual uploaded photos. The pattern catches every
      // generated-avatar URL host we know of.
      .not("avatar_url", "ilike", "%dicebear%")
      .not("avatar_url", "ilike", "%robohash%")
      .not("avatar_url", "ilike", "%gravatar%")
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(8);
    realFaces = ((rows ?? []) as any[])
      .filter((r) => (r.display_name || r.email))
      .slice(0, 5)
      .map((r) => ({
        id: r.id as string,
        name: (r.display_name as string) || (r.email as string).split("@")[0],
        avatar_url: r.avatar_url as string,
        handle: (r.handle as string) ?? null
      }));
  } catch {
    /* fall back to placeholder avatars in the hero */
  }

  return (
    <main>
      <TrackBeacon meta={{ door: "landing" }} />
      <style>{`
        .lh-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
        }
        .lh-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 32px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .lh-topbar-links {
          display: inline-flex;
          align-items: center;
          gap: 22px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-dim);
        }
        .lh-topbar-links a {
          color: var(--text-dim);
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .lh-topbar-links a:hover { color: var(--text); }
        .lh-topbar-cta {
          padding: 9px 16px;
          border-radius: 999px;
          background: var(--text);
          color: var(--bg);
          font-weight: 700;
          font-size: 14px;
          text-decoration: none;
        }

        .lh-how {
          max-width: 1080px;
          margin: 40px auto 0;
          padding: 0 24px 96px;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 800px) {
          .lh-how { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .lh-how-card {
          padding: 26px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--panel-solid);
          transition:
            transform 0.18s ease,
            box-shadow 0.22s ease,
            border-color 0.18s ease;
        }
        .lh-how-card:hover {
          transform: translateY(-3px);
          border-color: rgba(31, 89, 255, 0.4);
          box-shadow: 0 22px 50px -28px rgba(15, 23, 42, 0.22);
        }
        .lh-how-k {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px; height: 32px;
          border-radius: 999px;
          background: rgba(31, 89, 255, 0.10);
          color: #1f59ff;
          font-weight: 800;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .lh-how-card h3 {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.005em;
          margin: 0 0 6px;
        }
        .lh-how-card p {
          font-size: 14px;
          line-height: 1.55;
          color: var(--text-dim);
          margin: 0;
        }
      `}</style>

      <div className="lh-page" id="top">
        {/* Top nav — minimal. Wordmark bumped sm→md on desktop per
            Jack "Landing page logo too small on desktop." */}
        <header className="lh-topbar">
          <span className="lh-mark-desktop">
            <Wordmark size="lg" href={null} />
          </span>
          <span className="lh-mark-mobile">
            <Wordmark size="md" href={null} />
          </span>
          <nav className="lh-topbar-links">
            <a href="/article">How it works</a>
            <a href="/hypernetwork">Network</a>
            <Link href="/login" className="lh-topbar-cta">
              Sign in
            </Link>
          </nav>
        </header>
        <style>{`
          .lh-mark-mobile { display: inline-flex; }
          .lh-mark-desktop { display: none; }
          @media (min-width: 800px) {
            .lh-mark-mobile { display: none; }
            .lh-mark-desktop { display: inline-flex; }
          }
        `}</style>

        {/* Hero — handle picker, the only conversion surface above the fold.
            realFaces fetched above so the 40+ founders social proof strip
            shows actual platform users (Jack: "use real photos also on
            the homepage rather than these weird ones"). */}
        <LandingHandleHero realFaces={realFaces} />

        {/* Manifesto line — the soul of the project. Jack: "under
            this lets put the prior copy we made about what if the real
            friends we make was the superintelligence along the way."
            Big serif italic so it reads as a thesis statement, not
            another feature card. */}
        <section
          style={{
            maxWidth: 880,
            margin: "12px auto 0",
            padding: "32px 32px 8px",
            textAlign: "center"
          }}
        >
          <p
            style={{
              fontSize: "clamp(22px, 3.4vw, 32px)",
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: "-0.015em",
              fontStyle: "italic",
              color: "var(--text)",
              margin: 0
            }}
          >
            What if the real superintelligence was the friends we
            make along the way
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: "0.6ch",
                height: "0.95em",
                marginLeft: 2,
                verticalAlign: "-0.12em",
                background:
                  "linear-gradient(135deg, #1f59ff 0%, #6b2dc9 100%)",
                animation: "lh-cursor 1.05s steps(2) infinite"
              }}
            />
          </p>
          <style>{`
            @keyframes lh-cursor {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0; }
            }
          `}</style>
        </section>

        {/* How it works — three crisp cards */}
        <section className="lh-how">
          {[
            {
              k: "1",
              t: "Build your twin",
              d: "Paste a profile URL or your existing AI memory. We extract goals, voice, dealbreakers, and recent wins into a working clone."
            },
            {
              k: "2",
              t: "Twins talk for you",
              d: "Two twins run a full conversation toward a concrete win-win. Edit any message and the rest regenerates around your edit."
            },
            {
              k: "3",
              t: "You walk in synced",
              d: "Once both twins agree, you and the other person meet already aligned on the deal. No 30-min discovery calls, no missed angles."
            }
          ].map((c) => (
            <article key={c.k} className="lh-how-card">
              <div className="lh-how-k">{c.k}</div>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </article>
          ))}
        </section>

        {/* WHO IT'S FOR — Jack: "Are you looking for a co-founder,
            investors, advisors, or someone with an idea? SyncedIn is
            the way to get connected." Four-tile picker; each tile
            deep-links to /login with the goal pre-seeded as next= so
            onboarding can route accordingly. */}
        <section className="lh-who">
          <div className="lh-section-tag">who it&apos;s for</div>
          <h2 className="lh-section-h2">
            What are you looking for?
          </h2>
          <p className="lh-section-sub">
            Pick the one that&apos;s on your mind right now. Your twin
            negotiates from this angle first.
          </p>
          <div className="lh-who-grid">
            {[
              {
                emoji: "🤝",
                title: "A co-founder",
                line: "Find someone whose stack complements yours, with shared conviction on the same problem.",
                qs: "cofounder"
              },
              {
                emoji: "💰",
                title: "Investors",
                line: "Get warm intros to operators-turned-investors who actually back your category.",
                qs: "investors"
              },
              {
                emoji: "🧭",
                title: "Advisors",
                line: "Senior operators who've shipped what you're shipping. Trade time-for-equity at fair rates.",
                qs: "advisors"
              },
              {
                emoji: "💡",
                title: "Someone with an idea",
                line: "You want to build. They have the spark. Twins find the alignment + the missing pieces.",
                qs: "idea"
              }
            ].map((c) => (
              <Link
                key={c.qs}
                href={`/login?next=${encodeURIComponent(
                  `/onboarding?welcome=1&intent=${c.qs}`
                )}`}
                className="lh-who-card"
              >
                <div className="lh-who-emoji" aria-hidden="true">
                  {c.emoji}
                </div>
                <div className="lh-who-title">{c.title}</div>
                <p className="lh-who-line">{c.line}</p>
                <div className="lh-who-cta">Start with this →</div>
              </Link>
            ))}
          </div>
        </section>

        {/* WHY — pain section. Sells the cold-DM-is-broken thesis. */}
        <section className="lh-why">
          <div className="lh-section-tag">why now</div>
          <h2 className="lh-section-h2">
            Cold DMs are a coin flip. Your twin already knows the deal.
          </h2>
          <div className="lh-why-grid">
            <div className="lh-why-item">
              <div className="lh-why-stat">94%</div>
              <p>
                of LinkedIn cold DMs go unanswered. The signal is
                drowned in noise — even when the match is real.
              </p>
            </div>
            <div className="lh-why-item">
              <div className="lh-why-stat">30 min</div>
              <p>
                wasted per discovery call where you and your counterpart
                circle the same context their LinkedIn already showed.
              </p>
            </div>
            <div className="lh-why-item">
              <div className="lh-why-stat">~0 sec</div>
              <p>
                for your twin to read theirs and surface the highest-
                leverage win-win between you — before either of you
                lifts a finger.
              </p>
            </div>
          </div>
        </section>

        {/* DIFFERENTIATOR — agent-to-agent positioning. */}
        <section className="lh-diff">
          <div className="lh-section-tag">the new protocol</div>
          <h2 className="lh-section-h2">
            Agent-to-agent. Then human-to-human.
          </h2>
          <p className="lh-section-sub">
            Your twin reads their twin. They negotiate in seconds. You
            walk into the meeting already aligned on the destination.
          </p>
          <div className="lh-diff-row">
            <div className="lh-diff-col lh-diff-old">
              <div className="lh-diff-h">The old way</div>
              <ul>
                <li>Cold DM with a templated opener</li>
                <li>Wait days, hope they reply</li>
                <li>Spend the first 20 min of the call re-explaining context</li>
                <li>Realize on min 25 it&apos;s not actually a fit</li>
              </ul>
            </div>
            <div className="lh-diff-col lh-diff-new">
              <div className="lh-diff-h">SyncedIn</div>
              <ul>
                <li>Twins exchange full context in seconds</li>
                <li>They draft a concrete proposal, edited by you</li>
                <li>You walk in already on the same page</li>
                <li>Calls become signing the deal — not finding it</li>
              </ul>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF — quick. */}
        <section className="lh-proof">
          <div className="lh-section-tag">already syncing</div>
          <h2 className="lh-section-h2">
            40+ founders. 4.9 avg. Zero cold DMs.
          </h2>
          <p className="lh-section-sub">
            VCs ↔ founders. Founders ↔ cofounders. Operators ↔ advisors.
            Anyone whose first conversation should have happened months
            ago.
          </p>
        </section>

        {/* FAQ — short, addresses the 3 reflex objections. */}
        <section className="lh-faq">
          <div className="lh-section-tag">questions you have</div>
          <h2 className="lh-section-h2">Before you build your twin.</h2>
          <details className="lh-faq-item">
            <summary>Does my twin send messages without me?</summary>
            <p>
              No. Your twin drafts, you approve. Every outbound message
              is yours — your twin just writes the first version so you
              don&apos;t stare at a blank textbox.
            </p>
          </details>
          <details className="lh-faq-item">
            <summary>
              What if my twin doesn&apos;t sound like me?
            </summary>
            <p>
              Edit any message. The rest of the conversation regenerates
              around your edit, so your voice propagates forward.
            </p>
          </details>
          <details className="lh-faq-item">
            <summary>Who sees my data?</summary>
            <p>
              Your context only powers YOUR twin. We never share raw
              context with anyone else — only the proposals your twin
              sends. Delete your account in settings, and everything
              wipes.
            </p>
          </details>
          <details className="lh-faq-item">
            <summary>Is it actually free?</summary>
            <p>
              Yes for early users. Pro tier ($) unlocks unlimited
              conversations + premium destinations once we&apos;ve
              earned your trust.
            </p>
          </details>
        </section>

        {/* BOTTOM CTA — scroll back to the hero form. Jack: "AT THE
            BOTTOM OF THAT THAT THERES ANOTHER SIGN UP BUTTON WHICH
            PUSHES THEM TO THE TOP." Anchor to #top, smooth-scroll
            via CSS. */}
        <section style={{ padding: "32px 20px 8px" }}>
          <LoomEmbed
            id="f1a22bc84d914c6399f0ea20e955ccc8"
            title="See SyncedIn in action"
            caption="Two minutes on what it is and why it works."
          />
        </section>

        <section className="lh-bottom-cta">
          <h2 className="lh-section-h2">
            Your twin is 30 seconds away.
          </h2>
          <p className="lh-section-sub">
            Paste a handle. We do the rest. The first deal your twin
            lands pays for itself.
          </p>
          <a href="#top" className="lh-bottom-btn">
            Build my twin →
          </a>
          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "var(--text-dim)"
            }}
          >
            Takes you back to the top.
          </p>
        </section>

        <style>{`
          html { scroll-behavior: smooth; }

          .lh-section-tag {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #1f59ff;
          }
          .lh-section-h2 {
            margin: 8px 0 10px;
            font-size: clamp(28px, 4.2vw, 42px);
            font-weight: 900;
            letter-spacing: -0.025em;
            line-height: 1.1;
            color: var(--text);
          }
          .lh-section-sub {
            margin: 0 0 24px;
            font-size: 16px;
            line-height: 1.55;
            color: var(--text-dim);
            max-width: 620px;
          }

          .lh-who, .lh-why, .lh-diff, .lh-proof, .lh-faq, .lh-bottom-cta {
            max-width: 1080px;
            margin: 0 auto;
            padding: 56px 24px;
          }

          .lh-who-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 14px;
          }
          @media (min-width: 700px) {
            .lh-who-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
          @media (min-width: 1000px) {
            .lh-who-grid {
              grid-template-columns: repeat(4, minmax(0, 1fr));
            }
          }
          .lh-who-card {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 22px;
            border-radius: 18px;
            border: 1.5px solid var(--border);
            background: var(--panel-solid);
            color: var(--text);
            text-decoration: none;
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              box-shadow 0.22s ease;
          }
          .lh-who-card:hover {
            transform: translateY(-3px);
            border-color: rgba(31, 89, 255, 0.55);
            box-shadow: 0 20px 48px -22px rgba(31, 89, 255, 0.45);
          }
          .lh-who-emoji {
            font-size: 28px;
            line-height: 1;
          }
          .lh-who-title {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.01em;
          }
          .lh-who-line {
            margin: 0;
            font-size: 14px;
            line-height: 1.55;
            color: var(--text-dim);
            flex: 1;
          }
          .lh-who-cta {
            margin-top: 8px;
            font-size: 13px;
            font-weight: 800;
            color: #1f59ff;
          }

          .lh-why-grid {
            display: grid;
            gap: 14px;
            grid-template-columns: 1fr;
            margin-top: 16px;
          }
          @media (min-width: 800px) {
            .lh-why-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          .lh-why-item {
            padding: 22px;
            border-radius: 16px;
            background: rgba(31, 89, 255, 0.05);
            border: 1px solid rgba(31, 89, 255, 0.18);
          }
          .lh-why-stat {
            font-family: IBM Plex Mono, ui-monospace, monospace;
            font-size: 32px;
            font-weight: 900;
            letter-spacing: -0.02em;
            color: #1f59ff;
            margin-bottom: 8px;
          }
          .lh-why-item p {
            margin: 0;
            font-size: 14px;
            line-height: 1.55;
            color: var(--text-dim);
          }

          .lh-diff-row {
            display: grid;
            gap: 14px;
            grid-template-columns: 1fr;
            margin-top: 14px;
          }
          @media (min-width: 800px) {
            .lh-diff-row { grid-template-columns: repeat(2, 1fr); }
          }
          .lh-diff-col {
            padding: 22px;
            border-radius: 16px;
            border: 1.5px solid var(--border);
          }
          .lh-diff-col.lh-diff-old {
            background: rgba(127, 127, 127, 0.06);
          }
          .lh-diff-col.lh-diff-new {
            background: linear-gradient(
              135deg,
              rgba(31, 89, 255, 0.10) 0%,
              rgba(107, 45, 201, 0.10) 100%
            );
            border-color: rgba(31, 89, 255, 0.45);
          }
          .lh-diff-h {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--text-dim);
            margin-bottom: 10px;
          }
          .lh-diff-col ul {
            margin: 0;
            padding: 0 0 0 20px;
          }
          .lh-diff-col li {
            font-size: 14px;
            line-height: 1.6;
            padding: 3px 0;
          }
          .lh-diff-new .lh-diff-h {
            color: #1f59ff;
          }

          .lh-faq-item {
            padding: 14px 16px;
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 8px;
            background: var(--panel-solid);
          }
          .lh-faq-item summary {
            cursor: pointer;
            font-weight: 700;
            font-size: 15px;
            color: var(--text);
          }
          .lh-faq-item p {
            margin: 10px 0 0;
            font-size: 14px;
            line-height: 1.6;
            color: var(--text-dim);
          }

          .lh-bottom-cta {
            text-align: center;
            padding-top: 80px;
            padding-bottom: 96px;
          }
          .lh-bottom-cta .lh-section-sub {
            margin-left: auto;
            margin-right: auto;
          }
          .lh-bottom-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-top: 10px;
            padding: 18px 32px;
            font-size: 17px;
            font-weight: 800;
            color: #fff;
            background: #1f59ff;
            border-radius: 16px;
            text-decoration: none;
            box-shadow: 0 16px 36px -10px rgba(31, 89, 255, 0.5);
            transition: transform 0.15s ease;
          }
          .lh-bottom-btn:hover { transform: translateY(-2px); }
        `}</style>
      </div>
    </main>
  );
}
