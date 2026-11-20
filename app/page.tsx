import Link from "next/link";
import type { Viewport } from "next";
import { Compass, Handshake, Lightbulb, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LandingHandleHero } from "./LandingHandleHero";
import { LoomEmbed } from "./LoomEmbed";
import { TrackBeacon } from "./TrackBeacon";
import { ThemeToggle } from "./ThemeToggle";
import { PRODUCT_FAQS } from "@/lib/product-faq";

export const metadata = { alternates: { canonical: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://syncedin.org" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
const HOME_FAQS = ["message-review", "edit-a-message", "context-and-privacy", "pricing"].map(id => PRODUCT_FAQS.find(item => item.id === id)!);

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
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  // Show only non-test profiles with a public handle. Never derive a
  // public display name from a private email address.
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
      .select("id, display_name, avatar_url, handle")
      .eq("is_test_persona", false)
      .not("handle", "is", null)
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
      .filter((r) => typeof r.handle === "string" && r.handle.trim() && typeof r.avatar_url === "string" && r.avatar_url.trim())
      .slice(0, 5)
      .map((r) => ({
        id: r.id as string,
        name: (r.display_name as string) || (r.handle as string),
        avatar_url: r.avatar_url as string,
        handle: (r.handle as string) ?? null
      }));
  } catch {
    /* The hero remains usable without a photo strip. */
  }

  return (
    <main id="main-content">
      <TrackBeacon meta={{ door: "landing" }} />
      <style>{`
        .lh-page {
          --home-accent: #305ce5;
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
        }
        :root[data-theme="dark"] .lh-page { --home-accent: #a8beff; }
        .lh-page a:focus-visible, .lh-page button:focus-visible, .lh-page input:focus-visible, .lh-page summary:focus-visible { outline: 3px solid var(--home-accent); outline-offset: 4px; }
        .lh-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 24px;
          flex-wrap: wrap;
          gap: 18px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .lh-brand-group { display: flex; align-items: center; gap: 18px; }
        .lh-home-logo { display: block; width: 220px; height: auto; }
        .lh-brand-group button { min-width: 44px; min-height: 44px; padding: 0; color: var(--text-dim); border-radius: 6px; }
        .lh-topbar-links {
          display: inline-flex;
          align-items: center;
          gap: 22px;
          min-height: 44px;
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
        .lh-topbar-links a.lh-topbar-cta, .lh-topbar-links a.lh-topbar-cta:hover {
          padding: 9px 16px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          min-height: 44px;
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
          border-radius: 8px;
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
          color: var(--home-accent);
          font-weight: 800;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .lh-how-card h3 {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0;
          margin: 0 0 6px;
        }
        @media (max-width: 600px) {
          .lh-topbar { padding: 18px 20px; }
          .lh-topbar-links { width: 100%; justify-content: space-between; gap: 12px; }
          .lh-home-logo { width: 180px; }
        }
        @media (max-width: 360px) { .lh-topbar { padding-block: 16px; gap: 14px; } }
        .lh-how-card p {
          font-size: 14px;
          line-height: 1.55;
          color: var(--text-dim);
          margin: 0;
        }
      `}</style>

      <div className="lh-page" id="top">
        <header className="lh-topbar">
          <div className="lh-brand-group"><img src="/syncedin-wordmark-tight.png" alt="SyncedIn" width={220} height={54} className="lh-home-logo wordmark-themed" /><ThemeToggle /></div>
          <nav className="lh-topbar-links" aria-label="SyncedIn home navigation">
            <a href="/article">How it works</a>
            <a href="/hypernetwork">Network</a>
            <Link href="/login" className="lh-topbar-cta">
              Sign in
            </Link>
          </nav>
        </header>

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
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: 0,
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
              d: "Start with a public profile or a reviewed professional summary. Choose the goals, background, and preferences your twin should use."
            },
            {
              k: "2",
              t: "Explore a conversation",
              d: "Twins can draft an exchange around a specific purpose. Review names, facts, tone, and the proposed next step."
            },
            {
              k: "3",
              t: "Choose the real next step",
              d: "A draft can clarify an overlap or reveal a mismatch. Confirm interest and commitments with the actual people."
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
            Start with the purpose that matters to you. You can refine
            the context and boundaries during onboarding.
          </p>
          <div className="lh-who-grid">
            {[
              {
                Icon: Handshake,
                title: "A co-founder",
                line: "Explore complementary work, a shared problem, and what you would want to test together.",
                qs: "cofounder"
              },
              {
                Icon: UsersRound,
                title: "Investors",
                line: "Clarify why your project may fit someone's focus before asking for an introduction.",
                qs: "investors"
              },
              {
                Icon: Compass,
                title: "Advisors",
                line: "Bring a specific question and enough context for someone to decide whether they can help.",
                qs: "advisors"
              },
              {
                Icon: Lightbulb,
                title: "Someone with an idea",
                line: "Compare what each person wants to build, contribute, and learn from a first exchange.",
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
                  <c.Icon size={25} aria-hidden="true" />
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
            A useful introduction needs more than a polished opener.
          </h2>
          <div className="lh-why-grid">
            <div className="lh-why-item">
              <div className="lh-why-stat">Context</div>
              <p>
                Give the other person a real reason to care. Specific
                shared work is more informative than a generic pitch.
              </p>
            </div>
            <div className="lh-why-item">
              <div className="lh-why-stat">Purpose</div>
              <p>
                Start with one question or possible exchange. A clear
                purpose makes a proposal easier to accept, change, or decline.
              </p>
            </div>
            <div className="lh-why-item">
              <div className="lh-why-stat">Choice</div>
              <p>
                A match score and a simulated reply are not consent.
                The people decide whether the next step is worthwhile.
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
            Use selected context to explore the overlap. Read the draft,
            correct it, and confirm the actual next step together.
          </p>
          <div className="lh-diff-row">
            <div className="lh-diff-col lh-diff-old">
              <div className="lh-diff-h">An unclear first message</div>
              <ul>
                <li>An opener that could go to anyone</li>
                <li>A broad ask without a reason for this person</li>
                <li>Missing context about what you can offer</li>
                <li>No clear choice about the next step</li>
              </ul>
            </div>
            <div className="lh-diff-col lh-diff-new">
              <div className="lh-diff-h">SyncedIn</div>
              <ul>
                <li>Context you choose for this purpose</li>
                <li>An editable conversation and possible proposal</li>
                <li>Facts and assumptions for you to review</li>
                <li>A next step the actual people decide</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lh-proof">
          <div className="lh-section-tag">different reasons to connect</div>
          <h2 className="lh-section-h2">
            For the conversations worth exploring.
          </h2>
          <p className="lh-section-sub">
            Founders, collaborators, researchers, and advisors can start
            with the exchange they have in mind. A direct human message
            may still be the right tool for a simple request.
          </p>
        </section>

        {/* FAQ — short, addresses the 3 reflex objections. */}
        <section className="lh-faq">
          <div className="lh-section-tag">questions you have</div>
          <h2 className="lh-section-h2">Before you build your twin.</h2>
          {HOME_FAQS.map(item => <details className="lh-faq-item" key={item.id}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
            <p>{item.links.map((link, index) => <span key={link.href}>{index > 0 && " / "}<Link href={link.href}>{link.label}</Link></span>)}</p>
          </details>)}
          <p><Link href="/faq">All questions and answers</Link></p>
        </section>

        {/* BOTTOM CTA — scroll back to the hero form. Jack: "AT THE
            BOTTOM OF THAT THAT THERES ANOTHER SIGN UP BUTTON WHICH
            PUSHES THEM TO THE TOP." Anchor to #top, smooth-scroll
            via CSS. */}
        <section style={{ padding: "32px 20px 8px" }}>
          <LoomEmbed
            id="f1a22bc84d914c6399f0ea20e955ccc8"
            title="See SyncedIn in action"
            caption="A product walkthrough from the team."
          />
        </section>

        <section className="lh-bottom-cta">
          <h2 className="lh-section-h2">
            Start with your context.
          </h2>
          <p className="lh-section-sub">
            Bring a public profile, review the information, and choose
            what you want your twin to explore.
          </p>
          <a href="#top" className="lh-bottom-btn">
            Build my twin →
          </a>
        </section>

        <style>{`
          html { scroll-behavior: smooth; }

          .lh-section-tag {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0;
            color: var(--home-accent);
          }
          .lh-section-h2 {
            margin: 8px 0 10px;
            font-size: 36px;
            font-weight: 750;
            letter-spacing: 0;
            line-height: 1.2;
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
            border-radius: 8px;
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
            letter-spacing: 0;
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
            color: var(--home-accent);
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
            border-radius: 8px;
            background: rgba(31, 89, 255, 0.05);
            border: 1px solid rgba(31, 89, 255, 0.18);
          }
          .lh-why-stat {
            font-size: 26px;
            font-weight: 700;
            letter-spacing: 0;
            color: var(--home-accent);
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
            border-radius: 8px;
            border: 1.5px solid var(--border);
          }
          .lh-diff-col.lh-diff-old {
            background: rgba(127, 127, 127, 0.06);
          }
          .lh-diff-col.lh-diff-new {
            background: var(--panel-solid);
            border-color: var(--home-accent);
          }
          .lh-diff-h {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0;
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
            color: var(--home-accent);
          }

          .lh-faq-item {
            padding: 14px 16px;
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 8px;
            background: var(--panel-solid);
          }
          .lh-faq-item summary {
            cursor: pointer;
            font-weight: 700;
            font-size: 15px;
            color: var(--text);
            min-height: 30px;
          }
          .lh-faq-item p {
            margin: 10px 0 0;
            font-size: 14px;
            line-height: 1.6;
            color: var(--text-dim);
          }
          .lh-faq a { color: var(--home-accent); text-decoration: underline; text-underline-offset: 3px; }

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
            background: #305ce5;
            border-radius: 6px;
            text-decoration: none;
            box-shadow: 0 16px 36px -10px rgba(31, 89, 255, 0.5);
            transition: transform 0.15s ease;
          }
          .lh-bottom-btn:hover { transform: translateY(-2px); }
          @media (max-width: 600px) { .lh-section-h2 { font-size: 28px; } }
          @media (prefers-reduced-motion: reduce) {
            html { scroll-behavior: auto; }
            .lh-page *, .lh-page *::before, .lh-page *::after { animation: none !important; transition: none !important; }
          }
        `}</style>
      </div>
    </main>
  );
}
