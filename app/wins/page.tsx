import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../Wordmark";
import { TrackBeacon } from "../TrackBeacon";

/**
 * Member-published summaries from agreements accepted in the product.
 * Publication is not independent verification of a real-world outcome.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = withPublicSEO('/wins', {
  title: "Win Receipts: Member-Published Summaries",
  description:
    "Member-published summaries from agreements accepted on SyncedIn. Read the shared context without treating an in-app agreement as an independently verified outcome."
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
  let unavailable = false;
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("win_receipts")
      .select("id, outcome_text, party_a, party_b, anonymized, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) unavailable = true;
    receipts = (data ?? []) as Receipt[];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    thisWeek = receipts.filter(
      (r) => new Date(r.created_at).getTime() > weekAgo && new Date(r.created_at).getTime() <= Date.now()
    ).length;
  } catch {
    unavailable = true;
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
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: 0,
            lineHeight: 1.05,
            marginTop: 10
          }}
        >
          Shared outcomes. In members&apos; words.
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
          Members can publish an outcome summary after both participants accept an agreement in SyncedIn. These are member-reported summaries, not independent verification that a meeting, partnership or deal happened outside the product.
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
            {thisWeek} receipt{thisWeek === 1 ? "" : "s"} published in the last seven days among the latest 50
          </p>
        )}
      </section>

      <section className="mt-10" style={{ maxWidth: 640, margin: "40px auto 0" }}>
        {receipts.length === 0 ? (
          <div
            className="retro-panel"
            style={{ padding: 24, textAlign: "center" }}
          >
            <div role={unavailable ? "status" : undefined} style={{ fontWeight: 800, marginTop: 8 }}>
              {unavailable ? "Published receipts are temporarily unavailable." : "No public receipts to show yet."}
            </div>
            <p
              style={{
                marginTop: 6,
                fontSize: 14,
                color: "var(--text-dim)",
                lineHeight: 1.5
              }}
            >
              {unavailable ? "We could not load the published summaries. This does not mean there are no agreements. You can return later or continue to your twin." : "After both members accept an agreement, a participant can publish a named or anonymous summary here. An empty page does not establish how many conversations have happened."}
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
              Build your twin →
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
                  published {new Date(r.created_at).toLocaleDateString()}
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
