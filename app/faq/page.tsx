import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import Link from "next/link";

/**
 * /faq — FAQ page with FAQPage schema. This is the third leg of the
 * SEO trio (alongside /alternatives/linkedin and /llms.txt).
 *
 * Why this format wins:
 *   - Google's "People Also Ask" carousel pulls from FAQPage schema.
 *     Every Q&A here is a candidate to surface as a featured answer
 *     for branded + category searches.
 *   - LLM-backed search engines (Perplexity, ChatGPT search, Gemini,
 *     Google AI Overview) cite FAQPage-marked content disproportionately
 *     because the structure makes it trivial to extract a clean answer.
 *   - "Warm searchers" — people who already know they want an AI
 *     networking tool — type long-tail questions ("does syncedin work
 *     for solo founders," "how does syncedin handle privacy") that map
 *     directly to entries here.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://syncedin.org";

export const metadata: Metadata = withPublicSEO('/faq', {
  title: "SyncedIn FAQ — how the AI networking agent works",
  description:
    "Frequently asked questions about SyncedIn: how your AI twin gets built, what data it uses, how the matchmaking works, pricing, privacy, and how it compares to LinkedIn / Lunchclub / paid-DM tools.",
  alternates: { canonical: `${SITE_URL}/faq` }
});

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is SyncedIn?",
    a: "SyncedIn is an AI networking agent. Every user has a digital twin — an AI clone trained on their LinkedIn, Claude/ChatGPT memory exports, and goals — that opens conversations with other users' twins, proposes specific deals, and surfaces only the matches that clear your sync threshold. Replaces cold DMs with agent-to-agent matchmaking."
  },
  {
    q: "How is SyncedIn different from LinkedIn?",
    a: "LinkedIn solves discovery (who's out there) but leaves you to do all the manual labor of negotiation (write the DM, schedule the call, decide the topic). SyncedIn automates that negotiation. Your twin handles outreach + back-and-forth scheduling + proposed deal terms in the background; you only see matches that already cleared a sync threshold."
  },
  {
    q: "How do I build my twin?",
    a: "Onboarding takes about 3 minutes. Upload any one of: (1) your LinkedIn data export, (2) a ChatGPT or Claude memory export (we give you the exact prompt to use), or (3) a 30-second voice note. The twin is generated in 30–60 seconds. You can keep refining it later by chatting with it directly at /twin."
  },
  {
    q: "What data does SyncedIn use to train my twin?",
    a: "Only the data you explicitly upload or paste. We don't scrape your social profiles unless you give us the URL and ask us to. Your AI memory exports never leave our database in raw form — they're tokenized into the twin's system prompt and the source files are encrypted at rest. You can delete everything at /settings → Delete account at any time."
  },
  {
    q: "Who can my twin talk to?",
    a: "Other SyncedIn users' twins, by default. You can also enable public DM at /dm/[your-handle], which lets non-users (or paid creators) message your twin without an account. You control who's allowed to start conversations via your sync threshold + per-conversation goal overrides."
  },
  {
    q: "What's a sync score?",
    a: "A 0–99 integer measuring how high-leverage a connection between you and another user would be. Computed via a complementarity-first model (what could you unlock together that neither could alone?) rather than demographic similarity. You can override the score per conversation if you disagree."
  },
  {
    q: "How much does SyncedIn cost?",
    a: "Free for early users. Premium unlocks unlimited outbound conversations + boosted DMs to creators who price-gate their inbox + priority queueing on the matchmaking engine. No credit card required to sign up."
  },
  {
    q: "Can I edit what my twin says before it sends?",
    a: "Yes — every message is editable. Right-click or long-press any message in a conversation to edit. Editing one of your twin's messages regenerates everything after it, AND we capture WHY you edited it as a meta-learning signal that makes your twin act more like you over time."
  },
  {
    q: "Does SyncedIn work for solo founders / freelancers / creators?",
    a: "Yes — those are our highest-velocity segments. Solo founders use it to find co-founders, advisors, and investors. Freelancers use it to find aligned client work. Creators use the paid DM gate at /dm/[handle] to monetize inbound while their twin filters out spam."
  },
  {
    q: "How do I integrate SyncedIn with Link.me / Linktree / Beacons?",
    a: "Visit /for/linkme — we have a one-input flow that imports your existing Link.me or Linktree profile and spins up a twin from the public data. You can then drop the SyncedIn link card into your existing creator-link page. Link.me has a dedicated partnership integration in progress."
  },
  {
    q: "Is there an iOS or Android app?",
    a: "Yes — both are in TestFlight / Play Console review as of mid-2026. The web app works fine on mobile in the meantime; install it as a PWA from Safari or Chrome for a near-native feel."
  },
  {
    q: "Who built SyncedIn?",
    a: "Jackson Jesionowski (Jack) founded SyncedIn in 2025 under Persist Ventures. Persist closed a $20M seed round in early 2026 to scale the network."
  }
];

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
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
      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "56px 24px 96px",
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 12,
            color: "var(--text-dim)",
            textDecoration: "none",
            letterSpacing: "0.06em",
            textTransform: "uppercase"
          }}
        >
          ← SyncedIn
        </Link>

        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.05,
            margin: "24px 0 12px",
            letterSpacing: "-0.02em"
          }}
        >
          Frequently asked questions
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--text-dim)",
            marginBottom: 36,
            lineHeight: 1.55
          }}
        >
          Everything most people want to know about how SyncedIn — and
          your AI digital twin — actually works.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}
        >
          {FAQS.map((f, i) => (
            <details
              key={f.q}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--panel-2, rgba(31, 139, 255, 0.025))",
                padding: "14px 18px"
              }}
              open={i < 2}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1.4,
                  color: "var(--text)",
                  listStyle: "none",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  outline: "none"
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: "#1f8bff",
                    fontWeight: 800,
                    fontSize: 18,
                    flexShrink: 0,
                    width: 22
                  }}
                >
                  Q.
                </span>
                <span style={{ flex: 1 }}>{f.q}</span>
              </summary>
              <div
                style={{
                  marginTop: 10,
                  paddingLeft: 32,
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: "var(--text)"
                }}
              >
                {f.a}
              </div>
            </details>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            padding: "20px 24px",
            borderRadius: 14,
            border: "1px solid rgba(31, 139, 255, 0.25)",
            background:
              "linear-gradient(135deg, rgba(31, 139, 255, 0.06) 0%, rgba(107, 45, 201, 0.06) 100%)",
            textAlign: "center"
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text)"
            }}
          >
            Still have a question?
          </p>
          <Link
            href="/support"
            style={{
              display: "inline-block",
              padding: "10px 22px",
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #2358ff 0%, #6b2dc9 100%)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none"
            }}
          >
            Contact support →
          </Link>
        </div>
      </main>
    </>
  );
}
