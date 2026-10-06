import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import { LinkmeImporter } from "./LinkmeImporter";

/**
 * Custom landing page for Link.me users (#280).
 *
 * Single input: paste your Link.me URL. We scrape it server-side via
 * /api/linkme-import, show a preview of what we extracted, and route
 * the user into signup with the scrape carried over so their first
 * SyncedIn twin is auto-built from their existing public profile.
 *
 * The pitch on this page is the one that lands the partnership:
 * "Your Link.me is a static list. SyncedIn makes it speak for you."
 */

export const metadata: Metadata = withPublicSEO('/for/linkme', {
  title: "Turn your Link.me into an AI twin · SyncedIn",
  description:
    "Paste your Link.me URL — we'll build an AI version of you that visitors can talk to, routed to your existing links, with paid priority access when they need the real you.",
  openGraph: {
    title: "Turn your Link.me into an AI twin",
    description:
      "Your Link.me already tells people who you are. SyncedIn makes it talk for you."
  }
});

export default function LinkmeLandingPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #f7f5ff 0%, #ffffff 40%, #ffffff 100%)",
        color: "#0e1322"
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "40px 20px 80px"
        }}
      >
        {/* HERO */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#6b2dc9",
            marginBottom: 14
          }}
        >
          for Link.me creators
        </div>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            lineHeight: 1.1,
            margin: 0
          }}
        >
          Your Link.me should speak for you.
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "#4a5066",
            marginTop: 14,
            marginBottom: 28
          }}
        >
          Paste your Link.me URL. We&apos;ll generate an AI version of
          you that visitors can talk to — it answers their questions,
          routes them to your right link, and hands serious asks over to
          the real you for $X.
        </p>

        {/* IMPORTER — client island */}
        <LinkmeImporter />

        {/* HOW IT WORKS */}
        <div style={{ marginTop: 56 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6e768c",
              marginBottom: 14
            }}
          >
            how it works
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <Step
              n="1"
              title="Paste your Link.me URL"
              body="We pull your name, photo, bio, and every link you've added."
            />
            <Step
              n="2"
              title="We generate your AI twin"
              body="Trained on your public profile. Speaks in your voice. Knows about your offers, products, and links."
            />
            <Step
              n="3"
              title="Visitors talk to your twin, free"
              body="Free AI replies route them to your right link. Paid replies route to the real you, at the top of your inbox."
            />
            <Step
              n="4"
              title="You see exactly what people want from you"
              body="Weekly digest: 'this week, 12 visitors asked about advisory. 8 wanted your course. Consider a paid intro service.'"
            />
          </div>
        </div>

        {/* WHAT YOU GET BLOCK */}
        <div
          style={{
            marginTop: 40,
            padding: "20px 22px",
            borderRadius: 14,
            background: "rgba(107, 45, 201, 0.06)",
            border: "1px solid rgba(107, 45, 201, 0.18)"
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              marginBottom: 10
            }}
          >
            Three things you instantly get
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 14,
              lineHeight: 1.7,
              color: "#2a3046"
            }}
          >
            <li>
              <strong>A public chat link</strong> — drop it on your
              Link.me, IG bio, or anywhere. People talk to your twin.
            </li>
            <li>
              <strong>Pay-to-prioritize inbox</strong> — visitors who
              really need you can pay to jump the queue.
            </li>
            <li>
              <strong>Conversion intelligence</strong> — your twin tells
              you what to build, sell, or follow up on based on what
              people actually ask.
            </li>
          </ul>
        </div>

        <div
          style={{
            marginTop: 32,
            textAlign: "center",
            fontSize: 12,
            color: "#6e768c"
          }}
        >
          Powered by SyncedIn · the AI relationship layer
        </div>
      </div>
    </main>
  );
}

function Step({
  n,
  title,
  body
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: 12,
        background: "#fff",
        border: "1px solid #e8e6f5"
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background:
            "linear-gradient(135deg, #2358ff 0%, #6b2dc9 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
          flexShrink: 0
        }}
      >
        {n}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: "#4a5066",
            marginTop: 2
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
