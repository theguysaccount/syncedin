import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";
import { TrackBeacon } from "../TrackBeacon";
import { RecGeneratorCard } from "./RecGeneratorCard";
import { PiGeneratorCard } from "./PiGeneratorCard";
import { PortfolioBuildButton } from "./PortfolioBuildButton";
import { countReferrals } from "@/lib/invite-stats";

/**
 * PERSONAL INTELLIGENCE — Jack's vision: every user gets a generated,
 * deeply-personal page that turns their twin context into:
 *   - AI-generated images (viral-style "make me as X" series)
 *   - Movie + book recommendations with their own "why I liked it" notes
 *   - A personalized merch line (image-gen on archetype)
 *   - A personalized song
 *   - A life path blueprint
 *   - Initial plot ideas if they wanted to write a book / make a movie
 *   - If they have a business, a "potential huge success" projection
 *
 * V1 ships the scaffold with placeholder cards so the URL is real and
 * we can iterate per section. Each card has a clear "what this becomes"
 * description so the user understands the promise before the generators
 * land.
 *
 * Generators come online behind individual feature flags / endpoints
 * (each section's "generate" button hits a server route that we'll
 * implement incrementally — task #158 tracks the full build-out).
 */
export const dynamic = "force-dynamic";

export default async function PersonalIntelligencePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/personal-intelligence");

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }] = await Promise.all([
    service
      .from("profiles")
      .select("display_name, email, handle")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("twin_profiles")
      .select("goals, deal_preferences, ai_export_blob")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  // Unified count — same lib helper backs /invite + dashboard so all
  // three surfaces read the same number. Strict claim ∪ email match.
  const { count: referrals } = await countReferrals(user.id, {
    email: user.email
  });

  const firstName =
    ((profile as any)?.display_name || "").split(/\s+/)[0] ||
    user.email?.split("@")[0] ||
    "you";
  const hasTwin = Boolean((twin as any)?.goals);

  // Invite-unlock thresholds. Jack: "the merch line should unlock with
  // five invites who sign up." Lower-effort modules unlock at 0-1 so the
  // user has something to play with on day one; the harder / more
  // expensive ones gate behind real referral signups so the user has
  // an incentive to share SyncedIn.
  const handle = (profile as any)?.handle as string | null;
  const cards: {
    key: string;
    eyebrow: string;
    title: string;
    blurb: string;
    accent: string;
    icon: string;
    unlockAt: number; // referrals needed
  }[] = [
    {
      key: "portfolio",
      eyebrow: "Public portfolio",
      title: "Your public portfolio page",
      blurb:
        "One click and we publish your portfolio — a clean public page (syncedin.org/u/your-handle) people can land on after a conversation with you. Auto-generated from your twin context.",
      accent: "#1f8bff",
      icon: "🪪",
      unlockAt: 0
    },
    {
      key: "movies",
      eyebrow: "Recommendations",
      title: "Movies you should watch (and why)",
      blurb:
        "Curated picks based on your bio + tastes. Tell us why you loved one and the next 5 sharpen up.",
      accent: "#f97316",
      icon: "🎬",
      unlockAt: 0
    },
    {
      key: "books",
      eyebrow: "Recommendations",
      title: "Books you should read (and why)",
      blurb:
        "Same loop for reading. The longer you tell your twin what landed and why, the more useful the next list becomes.",
      accent: "#eab308",
      icon: "📚",
      unlockAt: 0
    },
    {
      key: "blueprint",
      eyebrow: "Life Path",
      title: "Your life path blueprint",
      blurb:
        "A visual map of where you've been, where the network thinks you're headed, and the highest-leverage next moves to get there.",
      accent: "#22c55e",
      icon: "🗺️",
      unlockAt: 0
    },
    {
      key: "images",
      eyebrow: "Images 2.0",
      title: `Generate ${firstName}-themed images`,
      blurb:
        "Viral-style portrait series built from your real context — your background, your work, your style. Pick a prompt, get a set you can post anywhere.",
      accent: "#1f8bff",
      icon: "🎨",
      unlockAt: 0
    },
    {
      key: "merch",
      eyebrow: "Merch",
      title: "A merch line that's actually you",
      blurb:
        "Auto-generated t-shirt + hoodie + sticker designs from your twin's archetype. Print-ready files, no design skill needed.",
      accent: "#6b2dc9",
      icon: "👕",
      unlockAt: 0
    },
    {
      key: "creative",
      eyebrow: "Your story",
      title: "If you wrote a book, this would be the plot",
      blurb:
        "Starter outline for a memoir, novel, or screenplay built from the most distinctive parts of your story. Three structural options to pick from.",
      accent: "#ec4899",
      icon: "✍️",
      unlockAt: 0
    },
    {
      key: "business",
      eyebrow: "Business projection",
      title: "What if your venture takes off?",
      blurb:
        "If you mentioned a business in your twin context, we sketch the potential huge-success path: TAM, GTM, the 18-month milestone arc.",
      accent: "#10b981",
      icon: "🚀",
      unlockAt: 0
    },
    {
      key: "song",
      eyebrow: "Audio",
      title: "Your personal song",
      blurb:
        "Generated track that captures your story arc — tempo, lyrics, and feel pulled from your twin context. Shareable as a personal anthem.",
      accent: "#d83bff",
      icon: "🎵",
      unlockAt: 0
    }
  ];

  return (
    <AppShell>
      <TrackBeacon meta={{ door: "personal-intelligence" }} />
      <header className="page-heading">
        <div><h1>Personal intelligence</h1><p>Your projects, perspectives, and next possibilities.</p></div>
        {!hasTwin && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(31, 139, 255, 0.06)",
              border: "1px solid rgba(31, 139, 255, 0.30)",
              fontSize: 13,
              color: "var(--text)"
            }}
          >
            Heads up: most of these generators want a fleshed-out twin.{" "}
            <a
              href="/onboarding"
              style={{
                color: "#1f8bff",
                fontWeight: 700,
                textDecoration: "underline"
              }}
            >
              Finish onboarding
            </a>{" "}
            for the best results.
          </div>
        )}
      </header>

      <style>{`
        /* Masonry-style columns instead of grid — cards keep their
           NATURAL height instead of stretching to match the tallest
           sibling in their row (Jack: "lets not have these sections
           height matched because now its super long now that I
           generated movies"). CSS columns auto-balance, no row stretch. */
        .pi-grid {
          column-count: 1;
          column-gap: 14px;
        }
        @media (min-width: 740px) {
          .pi-grid { column-count: 2; }
        }
        @media (min-width: 1100px) {
          .pi-grid { column-count: 3; }
        }
        .pi-grid > * {
          break-inside: avoid;
          -webkit-column-break-inside: avoid;
          page-break-inside: avoid;
          display: block;
          width: 100%;
          margin-bottom: 14px;
        }
        .pi-card {
          position: relative;
          padding: 18px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--panel-solid);
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 200px;
          transition: transform 0.15s ease, box-shadow 0.15s ease,
            border-color 0.15s ease;
        }
        .pi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 40px -18px rgba(15, 23, 42, 0.18);
        }
        .pi-card .icon {
          font-size: 28px;
          line-height: 1;
        }
        .pi-card .eyebrow {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .pi-card h3 {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.005em;
          margin: 0;
          line-height: 1.25;
        }
        .pi-card p {
          font-size: 13px;
          line-height: 1.55;
          color: var(--text-dim);
          margin: 0;
          flex-grow: 1;
        }
        .pi-card .soon {
          margin-top: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          background: var(--panel-2);
          border: 1px solid var(--border);
          font-size: 11px;
          font-weight: 700;
          color: var(--text-dim);
          align-self: flex-start;
        }
        /* Locked-card hover animation — shimmer sweep + lift + the
           progress bar glows. Click-through routes to /invite. */
        .pi-locked {
          opacity: 0.78;
          transition:
            transform 0.2s ease,
            opacity 0.2s ease,
            box-shadow 0.25s ease,
            border-color 0.2s ease;
        }
        .pi-locked:hover {
          transform: translateY(-2px);
          opacity: 1;
          border-color: rgba(107, 45, 201, 0.55);
          box-shadow: 0 18px 40px -20px rgba(107, 45, 201, 0.45);
        }
        .pi-shimmer {
          position: absolute;
          top: 0;
          left: -120%;
          width: 80%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(216, 59, 255, 0.10) 50%,
            transparent 100%
          );
          pointer-events: none;
          z-index: 0;
          transition: left 0.6s ease;
        }
        .pi-locked:hover .pi-shimmer {
          left: 140%;
        }
        .pi-locked .pi-progress-fill {
          transition: filter 0.25s ease, width 0.5s ease;
        }
        .pi-locked:hover .pi-progress-fill {
          filter: brightness(1.3) drop-shadow(0 0 6px rgba(216, 59, 255, 0.5));
        }
      `}</style>

      {/* Everything here is FREE — no invite gating (Jack: "let's make
          free, no invites"). Inviting is optional and just grows the
          network. */}
      <div
        style={{
          marginBottom: 14,
          padding: "10px 14px",
          borderRadius: 12,
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
          ✨ Everything here is free — generate anything below.
        </div>
        <a
          href="/invite"
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "7px 14px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff",
            textDecoration: "none",
            boxShadow: "0 6px 18px -6px rgba(99,102,241,0.45)"
          }}
        >
          💌 invite friends
        </a>
      </div>

      <section className="pi-grid">
        {cards.map((c) => {
          const locked = referrals < c.unlockAt;
          // Movies + Books are wired up to the real
          // /api/personal-intelligence/recs endpoint via RecGeneratorCard.
          // Portfolio is a real one-click claim card. Everything else
          // is a "Shipping soon" placeholder gated by referral unlocks.
          if (c.key === "portfolio") {
            return (
              <article
                key={c.key}
                className="pi-card"
                style={{
                  borderColor: "rgba(31, 139, 255, 0.35)",
                  background:
                    "linear-gradient(180deg, rgba(31, 139, 255, 0.05) 0%, var(--panel-solid) 60%)"
                }}
              >
                <span className="icon" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="eyebrow" style={{ color: c.accent }}>
                  {c.eyebrow}
                </span>
                <h3>{c.title}</h3>
                <p>{c.blurb}</p>
                {handle ? (
                  <div style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a
                      href={`/u/${handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="retro-btn retro-btn-primary"
                      style={{
                        fontSize: 12,
                        padding: "8px 14px",
                        textDecoration: "none"
                      }}
                    >
                      🔗 view your portfolio
                    </a>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-dim)",
                        alignSelf: "center"
                      }}
                    >
                      syncedin.org/u/{handle}
                    </span>
                  </div>
                ) : (
                  <PortfolioBuildButton />
                )}
              </article>
            );
          }
          if (c.key === "movies" && !locked) {
            return (
              <RecGeneratorCard
                key={c.key}
                kind="movies"
                icon={c.icon}
                eyebrow={c.eyebrow}
                title={c.title}
                blurb={c.blurb}
                accent={c.accent}
              />
            );
          }
          if (c.key === "books" && !locked) {
            return (
              <RecGeneratorCard
                key={c.key}
                kind="books"
                icon={c.icon}
                eyebrow={c.eyebrow}
                title={c.title}
                blurb={c.blurb}
                accent={c.accent}
              />
            );
          }
          // Every other generator hits the universal /api/personal-intelligence/generate
          // endpoint via PiGeneratorCard. Each kind has its own server prompt + client
          // render branch. Real audio / image / print integrations land later.
          const KIND_MAP: Record<string, "life-path" | "plot" | "business" | "images" | "song" | "merch"> = {
            blueprint: "life-path",
            creative: "plot",
            business: "business",
            images: "images",
            song: "song",
            merch: "merch"
          };
          const piKind = KIND_MAP[c.key];
          if (piKind && !locked) {
            return (
              <PiGeneratorCard
                key={c.key}
                kind={piKind}
                icon={c.icon}
                eyebrow={c.eyebrow}
                title={c.title}
                blurb={c.blurb}
                accent={c.accent}
              />
            );
          }
          // Locked cards are anchor tags that route to /invite, with a
          // hover animation: shimmer sweeps across the card + a faint
          // unlock-progress bar fills the bottom showing how close you
          // are to the threshold. Jack: "let's have an unlock
          // animation on whats not unlocked on hover and if I click it
          // send me to invite page."
          if (locked) {
            const pct = Math.min(
              100,
              Math.round((referrals / c.unlockAt) * 100)
            );
            const remaining = c.unlockAt - referrals;
            return (
              <a
                key={c.key}
                href="/invite"
                className="pi-card pi-locked"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  textDecoration: "none",
                  borderStyle: "dashed",
                  borderColor: "var(--border-bright)",
                  overflow: "hidden",
                  cursor: "pointer"
                }}
              >
                <div className="pi-shimmer" aria-hidden="true" />
                <span
                  className="icon"
                  aria-hidden="true"
                  style={{ position: "relative", zIndex: 1 }}
                >
                  {c.icon}
                </span>
                <span
                  className="eyebrow"
                  style={{ color: c.accent, position: "relative", zIndex: 1 }}
                >
                  {c.eyebrow}
                </span>
                <h3 style={{ position: "relative", zIndex: 1 }}>{c.title}</h3>
                <p style={{ position: "relative", zIndex: 1 }}>{c.blurb}</p>
                <span
                  className="soon"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(31, 139, 255, 0.12) 0%, rgba(107, 45, 201, 0.12) 100%)",
                    borderColor: "rgba(107, 45, 201, 0.35)",
                    color: "#6b2dc9",
                    position: "relative",
                    zIndex: 1
                  }}
                >
                  🔒 {remaining} more invite{remaining === 1 ? "" : "s"} to
                  unlock
                </span>
                {/* Progress bar at the bottom — fills as referrals
                    accumulate. Visible at rest, glows brighter on hover. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 3,
                    background: "var(--panel-2)",
                    overflow: "hidden"
                  }}
                >
                  <div
                    className="pi-progress-fill"
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background:
                        "linear-gradient(90deg, #1f8bff 0%, #6b2dc9 50%, #d83bff 100%)"
                    }}
                  />
                </div>
              </a>
            );
          }
          return (
            <article key={c.key} className="pi-card">
              <span className="icon" aria-hidden="true">
                {c.icon}
              </span>
              <span className="eyebrow" style={{ color: c.accent }}>
                {c.eyebrow}
              </span>
              <h3>{c.title}</h3>
              <p>{c.blurb}</p>
              <span className="soon">Shipping soon</span>
            </article>
          );
        })}
      </section>

      <p
        style={{
          marginTop: 24,
          fontSize: 11,
          color: "var(--text-dim)",
          textAlign: "center"
        }}
      >
        Have a generator you want first? Drop a note via the feedback
        widget on your dashboard — the most-requested ones ship first.
      </p>
    </AppShell>
  );
}
