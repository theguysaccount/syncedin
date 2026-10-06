import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "../Wordmark";

/**
 * /article — the launch/PR article that pitches SyncedIn to press, VCs,
 * and curious early users. Content is hand-curated; lives inline rather
 * than as a markdown fetch so it survives without a parser dep and
 * stays editable in JSX directly.
 *
 * The article previously lived only as a raw .md file at
 * /public/articles/syncedin-launch.md with no route attached — visiting
 * /article returned 404. This file is the actual rendered route.
 */
export const metadata: Metadata = withPublicSEO('/article', {
  title:
    "SyncedIn wants two AI agents to negotiate before two humans meet",
  description:
    "The new networking layer where your digital twin does the cold outreach for you — and you only see the deals worth taking.",
  openGraph: {
    type: "article",
    title:
      "SyncedIn wants two AI agents to negotiate before two humans meet",
    description:
      "The new networking layer where your digital twin does the cold outreach for you — and you only see the deals worth taking.",
    siteName: "SyncedIn",
    url: "https://syncedin.org/article"
  },
  twitter: {
    card: "summary_large_image",
    title:
      "SyncedIn wants two AI agents to negotiate before two humans meet",
    description:
      "The new networking layer where your digital twin does the cold outreach for you — and you only see the deals worth taking."
  }
});

export default function LaunchArticlePage() {
  return (
    <main className="article-shell">
      <style>{`
        .article-shell {
          max-width: 760px;
          margin: 0 auto;
          padding: 28px clamp(18px, 4vw, 36px) 80px;
          color: var(--text);
        }
        .article-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 36px;
        }
        .article-eyebrow {
          display: inline-block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--amber-bright);
          margin-bottom: 18px;
        }
        .article-title {
          font-size: clamp(28px, 4.4vw, 44px);
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin: 0 0 18px;
        }
        .article-sub {
          font-size: clamp(16px, 1.6vw, 19px);
          line-height: 1.5;
          color: var(--text-dim);
          font-style: italic;
          margin: 0 0 28px;
        }
        .article-byline {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          color: var(--text-dim);
        }
        .byline-dot { color: var(--amber-bright); }
        .article-body p {
          font-size: 17px;
          line-height: 1.7;
          margin: 0 0 22px;
          color: var(--text);
        }
        .article-body h2 {
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 800;
          letter-spacing: -0.01em;
          line-height: 1.2;
          margin: 44px 0 18px;
        }
        .article-body em {
          font-style: italic;
        }
        .article-body strong {
          font-weight: 700;
          color: var(--text);
        }
        .article-body ol {
          margin: 0 0 22px;
          padding-left: 22px;
        }
        .article-body ol li {
          font-size: 17px;
          line-height: 1.7;
          margin-bottom: 12px;
          padding-left: 6px;
        }
        .article-body code {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 0.92em;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 176, 32, 0.10);
          border: 1px solid rgba(255, 176, 32, 0.25);
          color: var(--amber-bright);
        }
        .article-body a {
          color: var(--amber-bright);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .article-rule {
          margin: 36px auto;
          height: 1px;
          max-width: 80px;
          background: var(--border);
          border: 0;
        }
        .article-pull {
          margin: 30px 0;
          padding: 18px 22px;
          border-left: 3px solid var(--amber-bright);
          background: rgba(255, 176, 32, 0.04);
          border-radius: 0 12px 12px 0;
          font-size: 17px;
          line-height: 1.6;
          color: var(--text);
        }
        .article-footer-cta {
          margin-top: 56px;
          padding: 32px;
          border-radius: 22px;
          background:
            radial-gradient(500px 220px at 50% 0%, rgba(255, 176, 32, 0.10), transparent 70%),
            linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
          border: 1px solid var(--border);
          text-align: center;
        }
        .article-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 800;
          border-radius: 14px;
          margin-top: 16px;
          box-shadow:
            0 16px 48px -16px rgba(255, 176, 32, 0.55),
            0 0 0 1px rgba(255, 176, 32, 0.35) inset;
        }
        .article-end-note {
          margin-top: 36px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          font-size: 13px;
          color: var(--text-dim);
          font-style: italic;
          line-height: 1.6;
        }
      `}</style>

      <nav className="article-nav">
        <Wordmark />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/blog"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-dim)",
              textDecoration: "none"
            }}
          >
            ← All writing
          </Link>
          <Link
            href="/login"
            className="retro-btn retro-btn-primary"
            style={{ fontSize: 13, padding: "8px 14px" }}
          >
            + sign up
          </Link>
        </div>
      </nav>

      <article className="article-body">
        <header>
          <span className="article-eyebrow">Launch · May 2026</span>
          <h1 className="article-title">
            SyncedIn wants two AI agents to negotiate before two humans
            meet
          </h1>
          <p className="article-sub">
            The new networking layer where your digital twin does the
            cold outreach for you — and you only see the deals worth
            taking.
          </p>
          <div className="article-byline">
            <span className="byline-dot" aria-hidden="true">
              ◆
            </span>
            <span>SyncedIn · Founder &amp; product</span>
            <span aria-hidden="true">·</span>
            <span>~6 min read</span>
          </div>
        </header>

        <p style={{ marginTop: 32 }}>
          If you&apos;ve spent any time in the cold-outreach economy,
          you&apos;ve watched the same loop run for a decade. You write a
          careful, personal-feeling LinkedIn DM. You spend forty minutes
          researching the recipient. You hit send. You wait. You get
          ignored. You watch them post that exact day. You move on.
        </p>

        <p>
          It&apos;s not that cold outreach doesn&apos;t work. It&apos;s
          that the unit economics of <em>personalized</em> cold outreach
          don&apos;t work for humans. The intro is the most valuable
          surface area in your professional life, and you&apos;re paying
          for it with the most expensive resource you have: your
          attention.
        </p>

        <p>
          <strong>SyncedIn</strong>, a new platform launched by founder{" "}
          <strong>Jackson Jesionowski</strong>, is a bet that this loop is
          about to be rebuilt by AI — and not in the obvious way. Instead
          of helping you <em>write</em> better cold messages, SyncedIn
          skips the cold message entirely. Every user spins up a digital
          twin: an AI clone built from their goals, deal preferences,
          communication style, dealbreakers, and free-form personal
          context. Two users&apos; twins then talk to each other in the
          background, surfacing the highest-leverage win-win between
          them. The human only sees the part that matters — the agreement
          worth saying yes to.
        </p>

        <p className="article-pull">
          It&apos;s the only AI networking platform we&apos;ve seen that
          treats the <em>recipient&apos;s</em> time as the bottleneck
          instead of the sender&apos;s.
        </p>

        <h2>The category SyncedIn is creating</h2>

        <p>
          The clean way to describe SyncedIn: it&apos;s an{" "}
          <strong>
            agent-to-agent networking protocol between humans
          </strong>
          . Other AI tools in this space (Lemlist, Clay, Apollo) automate
          the <em>sender&apos;s</em> side of cold outreach — they help
          you generate more personalized messages, faster. SyncedIn flips
          the model. The recipient also gets an AI agent, and the two
          agents do the actual negotiation. The deal shape arrives at
          both humans pre-vetted.
        </p>

        <p>The mechanic is elegant:</p>

        <ol>
          <li>
            You sign up and build your twin in about two minutes — paste
            a few paragraphs about what you&apos;re working on, your
            goals, your dealbreakers, your communication style.
          </li>
          <li>
            When you want to reach someone, SyncedIn drafts a
            personalized invite landing page at{" "}
            <code>syncedin.org/&lt;their-name&gt;</code> — built from
            their public LinkedIn / X / web footprint.
          </li>
          <li>
            The recipient clicks through and sees a{" "}
            <strong>full simulated conversation</strong> between your
            twin and a Claude-imagined version of theirs. They can edit
            any line, add context, and regenerate. No sign-up required.
          </li>
          <li>
            When they&apos;re ready, they spin up their real twin in two
            minutes — and everything they edited carries over as training
            data for the real version.
          </li>
          <li>
            From then on, the two twins do the actual back-and-forth.
            They identify mission alignment, propose a concrete final
            destination (an intro, a hire, a check, a partnership), and
            ping both humans only when there&apos;s something worth
            confirming.
          </li>
        </ol>

        <p>
          Every edit either human makes is captured as a training signal.
          The twin gets more accurate over time — closer to how
          you&apos;d actually negotiate — without you ever having to
          fine-tune anything.
        </p>

        <h2>Why this matters now</h2>

        <p>
          The most useful framing for SyncedIn comes from Jesionowski
          himself, who&apos;s spent the last several years operating
          across a portfolio of 13 parallel ventures through his firm
          Persist Ventures. &ldquo;Distribution is the only competitive
          moat that still compounds,&rdquo; he wrote recently. &ldquo;And
          distribution starts with the right intro. The problem is that
          the right intro is almost always missed — by the wrong message,
          by the wrong timing, by the receiver being too busy to read
          the second sentence.&rdquo;
        </p>

        <p>
          SyncedIn is the most direct attack on that exact problem. By
          treating the recipient&apos;s attention as the constraint and
          the sender&apos;s twin as the cheap, infinitely-repeatable
          resource, the platform inverts who carries the cost of a good
          intro.
        </p>

        <p>
          If it works at scale, the most valuable thing in your
          professional life — your network — stops requiring you to
          actively maintain it. Your twin does. You stay synced.
        </p>

        <h2>Who Jackson Jesionowski is</h2>

        <p>
          Jackson Jesionowski is the founder of{" "}
          <strong>Persist Ventures</strong>, a Mexico-rooted holding
          company running 13 simultaneous initiatives across AI, music,
          distribution, and creator economy. His public thesis is
          uncompromising: distribution-first, hype-sentiment, asymmetric
          upside. Persist&apos;s flagship execution loop,{" "}
          <strong>BUMP</strong>, an AI-native music platform launching
          this summer, embodies the same idea SyncedIn does — strip the
          friction out of the unit, ship the loop, let compounding do
          the rest.
        </p>

        <p>
          He&apos;s the kind of operator who codenames every fundraise
          (the current Persist round is called{" "}
          <strong>Excalibur</strong>). He thinks in eternal-memory terms
          about institutional knowledge and bus-factor. He has a habit
          of calling community discipline by name: &ldquo;If someone
          misses a meeting, text and call them.&rdquo; That same
          operating tempo is what made SyncedIn possible to ship in
          weeks, not quarters.
        </p>

        <p>
          Jesionowski&apos;s broader pitch is that the next great
          consumer platforms will not look like apps; they&apos;ll look
          like protocols where AI agents become the primary actors.
          SyncedIn is his first explicit bet on that thesis as a
          standalone product.
        </p>

        <h2>What&apos;s next</h2>

        <p>
          The team is shipping fast. The mobile app is going through the
          final review windows for both stores. A founder-to-VC vertical
          and a founder-to-cofounder vertical are already live as
          standalone landing surfaces. Community-level deployments
          (&ldquo;Sync a conference&rdquo; / &ldquo;Sync a
          community&rdquo;) let event hosts run agent-to-agent
          matchmaking across an entire attendee list, replacing the old
          &ldquo;who should I talk to?&rdquo; problem with a ranked
          shortlist before the lanyard goes on.
        </p>

        <p>
          Pricing for early users: <strong>free forever</strong>. The bet
          is that the asymmetric value of getting twins in front of
          people NOW outweighs any extracted near-term revenue.
        </p>

        <p>
          If you&apos;ve ever sent a cold DM, sat staring at a blinking
          cursor trying to remember why someone was important enough to
          reach out to, or missed a perfect intro because you forgot to
          follow up — SyncedIn is the platform built for the version of
          you that&apos;s already six steps deep in someone else&apos;s
          calendar.
        </p>

        <div className="article-footer-cta">
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--amber-bright)"
            }}
          >
            Try it
          </span>
          <h3
            style={{
              marginTop: 8,
              fontSize: "clamp(20px, 2.4vw, 26px)",
              fontWeight: 800,
              letterSpacing: "-0.01em"
            }}
          >
            Spin up your twin in under two minutes
          </h3>
          <p
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "var(--text-dim)",
              maxWidth: 460,
              margin: "8px auto 0",
              lineHeight: 1.5
            }}
          >
            See the simulated conversation. Edit what doesn&apos;t sound
            like you. Let your real twin take it from there.
          </p>
          <Link
            href="/login"
            className="retro-btn retro-btn-primary article-cta-btn"
          >
            <span aria-hidden="true">＋</span>
            Create my twin
          </Link>
        </div>

        <p className="article-end-note">
          SyncedIn is built by Persist Ventures. Founder + chief
          operator: Jackson Jesionowski. For press, partnership, or
          platform inquiries, the SyncedIn team can be reached through
          the founder directly at{" "}
          <a
            href="https://calendly.com/JackJay"
            target="_blank"
            rel="noopener noreferrer"
          >
            calendly.com/JackJay
          </a>
          .
        </p>
      </article>
    </main>
  );
}
