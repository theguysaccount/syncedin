import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";

/**
 * Shared shell for /vs/<competitor> SEO landing pages. Captures the
 * head-to-head intent ("X alternative" / "SyncedIn vs X") with a
 * focused hero, a side-by-side comparison table, a "why we're
 * different" deep-dive, and a CTA. Designed to be ranking-friendly:
 * unique title + meta description per page, semantic h1/h2/h3
 * hierarchy, FAQ schema-ready section, lots of pure-text copy that
 * search engines can crawl.
 *
 * Each /vs/<slug>/page.tsx file is just a config wrapper that passes
 * positioning + comparison-row content into this shell.
 */
export type VsRow = {
  feature: string;
  syncedin: string;
  them: string;
  highlight?: boolean;
};

export function VsPageShell({
  competitor,
  competitorSlug,
  positioning,
  ourPitch,
  theirPitch,
  rows,
  whyWeWin,
  faq,
  reviewedAt,
  sources
}: {
  /** Display name of the competitor, e.g. "Lemlist" */
  competitor: string;
  /** URL-safe slug (must match the route folder), e.g. "lemlist" */
  competitorSlug: string;
  /** Single-line positioning of the competitor — e.g.
   *  "the sender-side cold-email personalization tool" */
  positioning: string;
  /** How SyncedIn frames itself in this context */
  ourPitch: string;
  /** How the competitor frames itself (used for fair comparison) */
  theirPitch: string;
  /** Feature rows for the side-by-side table */
  rows: VsRow[];
  /** 2-4 paragraphs of "the real difference" explanation */
  whyWeWin: { heading: string; body: string }[];
  /** Visible questions and their matching structured data. */
  faq: { q: string; a: string }[];
  reviewedAt: string;
  sources: { label: string; url: string }[];
}) {
  return (
    <main className="vs-shell">
      <style>{`
        .vs-shell {
          --accent: #305ce5;
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px clamp(18px, 4vw, 36px) 80px;
        }
        .vs-content { position: relative; z-index: 1; }
        :root[data-theme="dark"] .vs-shell { --accent: #a8beff; }
        .vs-shell a:focus-visible, .vs-shell [tabindex]:focus-visible { outline: 3px solid #4e74f4; outline-offset: 4px; }
        .vs-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 32px;
          flex-wrap: wrap;
          gap: 20px;
        }
        .vs-brand img { display: block; width: 180px; height: auto; }
        .vs-brand-group { display: flex; align-items: center; gap: 18px; }
        .vs-brand-group button { min-height: 44px; min-width: 44px; border-radius: 6px; padding: 0; color: var(--text-dim); }
        .vs-nav > a:last-child { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; }
        .vs-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(31, 139, 255, 0.08);
          border: 1px solid rgba(31, 139, 255, 0.30);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 16px;
        }
        .vs-h1 {
          font-size: 42px;
          line-height: 1.05;
          letter-spacing: 0;
          font-weight: 800;
          margin: 0 0 16px;
          max-width: 880px;
        }
        .vs-h1 em {
          font-style: normal;
          background: linear-gradient(90deg, #1f8bff, #3b6dff 60%, #6b2dc9);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .vs-sub {
          font-size: 18px;
          line-height: 1.55;
          color: var(--text-dim);
          max-width: 720px;
          margin: 0 0 28px;
        }
        .vs-cta-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 48px;
        }
        .vs-cta-primary {
          padding: 14px 24px;
          font-size: 15px;
          font-weight: 800;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          box-shadow:
            0 16px 48px -16px rgba(31, 139, 255, 0.45),
            0 0 0 1px rgba(31, 139, 255, 0.25) inset;
        }
        /* Comparison table */
        .vs-compare {
          margin: 32px 0 56px;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--panel-solid);
        }
        .vs-compare-head {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
          gap: 0;
          background: var(--panel-2);
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0;
        }
        .vs-compare-head > div {
          padding: 16px 18px;
        }
        .vs-compare-head .syncedin-col {
          color: var(--accent);
          border-left: 1px solid var(--border);
        }
        .vs-compare-head .them-col {
          color: var(--text-dim);
          border-left: 1px solid var(--border);
        }
        .vs-compare-row {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
          border-top: 1px solid var(--border);
        }
        .vs-compare-row.highlight {
          background: rgba(31, 139, 255, 0.04);
        }
        .vs-compare-row > div {
          padding: 14px 18px;
          font-size: 13.5px;
          line-height: 1.5;
        }
        .vs-compare-row .feature {
          font-weight: 700;
        }
        .vs-compare-row .syncedin-cell {
          color: var(--text);
          border-left: 1px solid var(--border);
        }
        .vs-compare-row .them-cell {
          color: var(--text-dim);
          border-left: 1px solid var(--border);
        }
        @media (max-width: 760px) {
          .vs-compare-head, .vs-compare-row {
            grid-template-columns: minmax(0, 1fr);
          }
          .vs-compare-head > div, .vs-compare-row > div {
            border-left: 0 !important;
          }
          .vs-compare-row .syncedin-cell::before,
          .vs-compare-row .them-cell::before {
            content: attr(data-label);
            display: block;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0;
            text-transform: uppercase;
            color: var(--text-dim);
            margin-bottom: 4px;
          }
          .vs-compare-row .syncedin-cell::before { color: var(--accent); }
        }
        .vs-section {
          margin-top: 56px;
        }
        .vs-section-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 12px;
        }
        .vs-section h2 {
          font-size: 28px;
          line-height: 1.2;
          letter-spacing: 0;
          font-weight: 800;
          margin: 0 0 14px;
        }
        .vs-pillar-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
          margin-top: 18px;
        }
        @media (min-width: 760px) {
          .vs-pillar-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .vs-pillar {
          padding: 22px;
          background: var(--panel-solid);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .vs-pillar h3 {
          font-size: 17px;
          font-weight: 800;
          margin: 0 0 8px;
          letter-spacing: 0;
        }
        .vs-pillar p {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--text-dim);
          margin: 0;
        }
        .vs-faq {
          margin-top: 12px;
        }
        .vs-faq-item {
          border-top: 1px solid var(--border);
          padding: 18px 0;
        }
        .vs-faq-item:first-child {
          border-top: 0;
        }
        .vs-faq-item h3 {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 8px;
          letter-spacing: 0;
        }
        .vs-faq-item p {
          font-size: 14.5px;
          line-height: 1.65;
          color: var(--text-dim);
          margin: 0;
        }
        .vs-footer-cta {
          margin-top: 64px;
          padding: 36px 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          text-align: center;
        }
        .vs-sources { margin-top: 28px; font-size: 14px; line-height: 1.8; color: var(--text-dim); }
        .vs-sources a { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
        .vs-source-links { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0; }
        @media (max-width: 600px) { .vs-h1 { font-size: 32px; } .vs-sub { font-size: 17px; } .vs-section h2 { font-size: 24px; } .vs-brand img { width: 150px; } .vs-nav { gap: 16px; } }
      `}</style>

      <div className="vs-content">
        <nav className="vs-nav" aria-label="SyncedIn comparison navigation">
          <div className="vs-brand-group"><Link href="/" className="vs-brand" aria-label="SyncedIn home"><img src="/syncedin-wordmark-tight.png" alt="SyncedIn" width={180} height={44} className="wordmark-themed" /></Link><ThemeToggle /></div>
          <Link
            href="/login"
            className="retro-btn retro-btn-primary"
            style={{ fontSize: 13, padding: "8px 14px" }}
          >
            <Plus size={16} aria-hidden="true" /> Create your twin
          </Link>
        </nav>

        <header>
          <span className="vs-eyebrow">SyncedIn vs {competitor}</span>
          <h1 className="vs-h1">
            SyncedIn vs {competitor}
          </h1>
          <p className="vs-sub">
            {competitor} is {positioning}. SyncedIn focuses on the context
            behind an introduction: people can build digital twins,
            explore a draft conversation, and review the proposed outcome
            before making a real-world commitment.
          </p>
          <div className="vs-cta-row">
            <Link
              href="/login"
              className="retro-btn retro-btn-primary vs-cta-primary"
            >
              <Plus size={17} aria-hidden="true" /> Create my twin
            </Link>
            <Link
              href="/article"
              className="retro-btn vs-cta-primary"
              style={{ fontWeight: 700, fontSize: 14 }}
            >
              Read the launch story <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <section aria-label={`SyncedIn vs ${competitor} comparison`}>
          <div className="vs-section-label">side by side</div>
          <h2 style={{ fontSize: 26, margin: 0, fontWeight: 800, letterSpacing: 0 }}>
            Compare the workflows
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-dim)", maxWidth: 760 }}>{ourPitch}. {theirPitch}. Choose the work you need done.</p>

          <div className="vs-compare" role="table" aria-label={`SyncedIn and ${competitor} workflows`}>
            <div className="vs-compare-head" role="row">
              <div role="columnheader">What you get</div>
              <div className="syncedin-col" role="columnheader">SyncedIn</div>
              <div className="them-col" role="columnheader">{competitor}</div>
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                role="row"
                className={`vs-compare-row ${r.highlight ? "highlight" : ""}`}
              >
                <div className="feature" role="rowheader">{r.feature}</div>
                <div className="syncedin-cell" data-label="SyncedIn" role="cell">
                  {r.syncedin}
                </div>
                <div
                  className="them-cell"
                  data-label={competitor}
                  role="cell"
                >
                  {r.them}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="vs-section">
          <div className="vs-section-label">the real difference</div>
          <h2>What changes in your workflow</h2>
          <div className="vs-pillar-grid">
            {whyWeWin.map((p, i) => (
              <article key={i} className="vs-pillar">
                <h3>{p.heading}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vs-section">
          <div className="vs-section-label">common questions</div>
          <h2>SyncedIn vs {competitor}: common questions</h2>
          <div className="vs-faq">
            {faq.map((f, i) => (
              <div key={i} className="vs-faq-item">
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
          <section className="vs-sources" aria-label="Sources and disclosure">
            <p>This is SyncedIn&apos;s product comparison, not an independent benchmark. Features and access can change. Sources reviewed <time dateTime={reviewedAt}>{new Date(`${reviewedAt}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>:</p>
            <div className="vs-source-links">{sources.map(source => <a href={source.url} key={source.url}>{source.label}</a>)}</div>
            <p>For practical examples, see our <Link href="/guides/linkedin-connection-request">connection-note guide</Link>, <Link href="/guides/networking-goals">conversation-goal builder</Link>, and <Link href="/guides/networking-follow-up">follow-up guide</Link>.</p>
          </section>

          {/* This matches the visible questions; rich-result eligibility is separate. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "@id": `https://syncedin.org/vs/${competitorSlug}#faq`,
                url: `https://syncedin.org/vs/${competitorSlug}`,
                dateModified: reviewedAt,
                mainEntity: faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: f.a
                  }
                }))
              })
            }}
          />
        </section>

        <section className="vs-footer-cta">
          <div className="vs-section-label">try it free</div>
          <h2 style={{ marginTop: 8 }}>
            Start with the context you choose.
          </h2>
          <p
            style={{
              marginTop: 10,
              fontSize: 14.5,
              color: "var(--text-dim)",
              maxWidth: 520,
              margin: "10px auto 0",
              lineHeight: 1.5
            }}
          >
            Create a twin, start a conversation, and review the draft.
            Public-source assumptions can be incomplete. A simulated
            reply is not something the other person actually said.
          </p>
          <div style={{ marginTop: 22 }}>
            <Link
              href="/login"
              className="retro-btn retro-btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 28px",
                fontSize: 15,
                fontWeight: 800,
                borderRadius: 6,
                boxShadow:
                  "0 16px 48px -16px rgba(31, 139, 255, 0.45), 0 0 0 1px rgba(31, 139, 255, 0.25) inset"
              }}
            >
              <Plus size={17} aria-hidden="true" />
              Create my twin
            </Link>
          </div>
          <p
            style={{
              marginTop: 18,
              fontSize: 11,
              color: "var(--text-dim)"
            }}
          >
            You choose what to share and which proposed next steps to accept.
          </p>
        </section>
      </div>
    </main>
  );
}
