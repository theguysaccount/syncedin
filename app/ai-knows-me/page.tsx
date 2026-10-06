import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wordmark } from "../Wordmark";
import { TrackBeacon } from "../TrackBeacon";
import { AiKnowsMeFunnel } from "./AiKnowsMeFunnel";

/**
 * /ai-knows-me, a standalone viral landing (Jack: separate from the main
 * funnel so it can be tested without disrupting anything).
 *
 * The hook: the AI you already use has months of memory about you. Copy
 * one prompt, ask it, paste the answer here, and we decode it into your
 * Personal Intelligence profile, free, no account. Claiming it drops the
 * visitor into onboarding with the dump prefilled (same seed key as
 * /generate-free-portfolio), so the twin builds from what they pasted.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = withPublicSEO('/ai-knows-me', {
  title: "What does your AI actually know about you? · SyncedIn",
  description:
    "You've talked to ChatGPT or Claude for months. It has a picture of you. Copy one prompt, paste its answer, and see your Personal Intelligence decoded in seconds. Free.",
  openGraph: {
    title: "What does your AI actually know about you?",
    description:
      "The 60 second test: ask the AI you already use to describe you, paste its answer, and see your Personal Intelligence decoded.",
    type: "website"
  }
});

export default async function AiKnowsMePage({
  searchParams
}: {
  searchParams?: { preview?: string };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  // Signed-in users already have a twin path. Send them to build it.
  // ?preview=1 skips the redirect so the experience can be filmed and QA'd
  // while signed in.
  if (user && !searchParams?.preview) redirect("/onboarding");

  return (
    <main className="max-w-3xl mx-auto px-5 py-6">
      <TrackBeacon meta={{ door: "ai-knows-me" }} />
      <div className="flex items-center justify-between">
        <Wordmark size="md" />
        <a href="/login" className="retro-dim text-sm hover:text-white">
          sign in
        </a>
      </div>

      <section className="mt-10 text-center">
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--amber-bright)"
          }}
        >
          The 60 second test
        </div>
        <h1
          className="retro-h1"
          style={{
            fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1.03,
            marginTop: 10
          }}
        >
          Your AI already knows you.
          <br />
          See what it says.
        </h1>
        <p
          style={{
            marginTop: 14,
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--text-dim)",
            maxWidth: 560,
            marginInline: "auto"
          }}
        >
          You&apos;ve been talking to ChatGPT or Claude for months. It has a
          picture of you that your resume never will. Copy one prompt, ask
          your AI, paste the answer here, and we decode it into your
          Personal Intelligence. Free, in seconds.
        </p>
      </section>

      <section className="mt-8">
        <AiKnowsMeFunnel />
      </section>

      <section className="mt-12" style={{ maxWidth: 640, margin: "48px auto 0" }}>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))"
          }}
        >
          {[
            {
              icon: "🧠",
              t: "One prompt",
              d: "Your AI describes you better than your bio does. The prompt pulls all of it out, memories included."
            },
            {
              icon: "⚡",
              t: "Instant decode",
              d: "Paste the answer and see your Personal Intelligence profile in seconds. No account needed."
            },
            {
              icon: "🤝",
              t: "Then it works for you",
              d: "Claim it and your AI twin starts talking to other twins, surfacing real win-wins for you."
            }
          ].map((c) => (
            <div key={c.t} className="retro-panel" style={{ padding: 16 }}>
              <div style={{ fontSize: 22 }}>{c.icon}</div>
              <div style={{ fontWeight: 800, marginTop: 6, fontSize: 14 }}>{c.t}</div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  marginTop: 4,
                  lineHeight: 1.45
                }}
              >
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
