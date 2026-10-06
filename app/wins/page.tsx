import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../Wordmark";
import { TrackBeacon } from "../TrackBeacon";

/**
 * /wins, proof not promises. Every card on this page is a real
 * outcome a participant chose to publish from an accepted agreement.
 * Nothing here is seeded, faked, or AI-invented. If the page is empty,
 * it says so honestly. North-star metric lives here: accepted win-wins
 * per week.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = withPublicSEO('/wins', {
  title: "Win receipts · SyncedIn",
  description:
    "Real outcomes from twin-negotiated matches, published by the people who made them. Proof, not promises."
});

type Receipt = {
  id: string;
  outcome_text: string;
  party_a: string;
  party_b: string;
  anonymized: boolean;
  created_at: string;
};

export default async function WinsPage() {
  let receipts: Receipt[] = [];
  let thisWeek = 0;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("win_receipts")
      .select("id, outcome_text, party_a, party_b, anonymized, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    receipts = (data ?? []) as Receipt[];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    thisWeek = receipts.filter(
      (r) => new Date(r.created_at).getTime() > weekAgo
    ).length;
  } catch {
    /* table not migrated yet: page renders the honest empty state */
  }

  return (
    <main className="max-w-3xl mx-auto px-5 py-6">
      <TrackBeacon meta={{ door: "wins" }} />
      <div className="flex items-center justify-between">
        <Wordmark size="md" />
        <Link href="/" className="retro-dim text-sm hover:text-white">
          home
        </Link>
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
          Win receipts
        </div>
        <h1
          className="retro-h1"
          style={{
            fontSize: "clamp(30px, 5.5vw, 46px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            marginTop: 10
          }}
        >
          Proof, not promises.
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--text-dim)",
            maxWidth: 540,
            marginInline: "auto"
          }}
        >
          Every card below is a real outcome from a twin-negotiated match,
          published by a participant after the agreement was accepted.
          Nothing on this page is seeded or invented.
        </p>
        {thisWeek > 0 && (
          <p
            style={{
              marginTop: 10,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--green)"
            }}
          >
            {thisWeek} win-win{thisWeek === 1 ? "" : "s"} accepted this week
          </p>
        )}
      </section>

      <section className="mt-10" style={{ maxWidth: 640, margin: "40px auto 0" }}>
        {receipts.length === 0 ? (
          <div
            className="retro-panel"
            style={{ padding: 24, textAlign: "center" }}
          >
            <div style={{ fontSize: 22 }}>🧾</div>
            <div style={{ fontWeight: 800, marginTop: 8 }}>
              Receipts ship here as win-wins complete.
            </div>
            <p
              style={{
                marginTop: 6,
                fontSize: 14,
                color: "var(--text-dim)",
                lineHeight: 1.5
              }}
            >
              When two members accept an agreement, either one can publish
              the outcome here, named or anonymous. We would rather show
              you an empty page than a fake one.
            </p>
            <Link
              href="/ai-knows-me"
              className="retro-btn retro-btn-primary"
              style={{
                display: "inline-block",
                marginTop: 14,
                padding: "10px 18px",
                textDecoration: "none",
                fontWeight: 800
              }}
            >
              Be the first: build your twin →
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {receipts.map((r) => (
              <div key={r.id} className="retro-panel" style={{ padding: 18 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "var(--amber-bright)"
                  }}
                >
                  {r.party_a} × {r.party_b}
                </div>
                <p
                  style={{
                    marginTop: 8,
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: "var(--text)"
                  }}
                >
                  {r.outcome_text}
                </p>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: "var(--text-dim)"
                  }}
                >
                  accepted {new Date(r.created_at).toLocaleDateString()}
                  {r.anonymized ? " · published anonymously" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
