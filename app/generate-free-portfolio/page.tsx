import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wordmark } from "../Wordmark";
import { TrackBeacon } from "../TrackBeacon";
import { GeneratePortfolioForm } from "./GeneratePortfolioForm";

/**
 * /generate-free-portfolio — a standalone, advertisable conversion funnel
 * (Jack). Visitor pastes their personal intelligence, instantly sees a
 * generated portfolio teaser, then signs up to claim it. Another front
 * door into onboarding.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = withPublicSEO('/generate-free-portfolio', {
  title: "Generate your free portfolio · SyncedIn",
  description:
    "Paste anything about yourself and get a sharp professional portfolio in seconds — free. Then your AI twin starts finding win-wins for you.",
  openGraph: {
    title: "Generate your free portfolio in seconds",
    description:
      "Paste your ChatGPT/Claude memory or bio. We turn it into a clean portfolio, free.",
    type: "website"
  }
});

export default async function GenerateFreePortfolioPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  // Signed-in users already have a portfolio path — send them to build it.
  if (user) redirect("/onboarding");

  return (
    <main className="max-w-3xl mx-auto px-5 py-6">
      <TrackBeacon meta={{ door: "generate-free-portfolio" }} />
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
          Free portfolio generator
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
          Paste who you are.
          <br />
          Get your portfolio in seconds.
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
          Drop in your ChatGPT or Claude memory, your bio, or just everything
          about what you do. We turn it into a sharp public portfolio, free.
          Then your AI twin starts finding the win-wins worth your time.
        </p>
      </section>

      <section className="mt-8">
        <GeneratePortfolioForm />
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
            { icon: "📋", t: "Paste anything", d: "Memory export, bio, or a brain dump. The more, the sharper." },
            { icon: "✨", t: "Instant portfolio", d: "A clean, public page at syncedin.org/u/you in seconds." },
            { icon: "🤝", t: "Twin finds win-wins", d: "Your twin talks to others' twins and surfaces real matches." }
          ].map((c) => (
            <div key={c.t} className="retro-panel" style={{ padding: 16 }}>
              <div style={{ fontSize: 22 }}>{c.icon}</div>
              <div style={{ fontWeight: 800, marginTop: 6, fontSize: 14 }}>{c.t}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.45 }}>
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
