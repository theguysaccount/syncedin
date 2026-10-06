import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../../Wordmark";
import { Avatar } from "../../Avatar";
import { PortfolioEditor } from "./PortfolioEditor";
import { CustomSite, type PortfolioPage } from "./CustomSite";
import { RegenerateButton } from "./RegenerateButton";
import { RealtimeStrip } from "./RealtimeStrip";

// Per-request render — the page renders fresh data + needs the viewer's
// auth cookie to decide whether to show owner-only edit affordances.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Theme = {
  accent?: string;
  bg?: string;
  banner_emoji?: string;
  vibe?: string;
};

function defaultTheme(): Theme {
  return {
    accent: "#6b2dc9",
    bg: "linear-gradient(180deg, #f4f3ff 0%, #ffffff 60%)",
    banner_emoji: "✨",
    vibe: "founder-in-flight"
  };
}

export async function generateMetadata({
  params
}: {
  params: { handle: string };
}): Promise<Metadata> {
  const service = createServiceClient();
  const { data: p } = await service
    .from("profiles")
    .select("display_name, portfolio_about")
    .ilike("handle", params.handle)
    .maybeSingle();
  if (!p) return { robots: { index: false, follow: true } };
  const name = (p.display_name as string) || params.handle;
  const desc =
    ((p.portfolio_about as string) || "").slice(0, 180) ||
    `${name}'s portfolio on SyncedIn — what they're working on, what they're looking for, who their twin would love to talk to.`;
  return {
    title: name,
    description: desc,
    alternates: { canonical: `https://syncedin.org/u/${encodeURIComponent(params.handle.toLowerCase())}` },
    openGraph: { title: name, description: desc, type: "profile", url: `https://syncedin.org/u/${encodeURIComponent(params.handle.toLowerCase())}`, images: [{ url: "https://syncedin.org/social/syncedin-preview.gif", width: 600, height: 338, alt: "SyncedIn public portfolio", type: "image/gif" }] },
    twitter: { card: "summary_large_image", title: name, description: desc, images: [{ url: "https://syncedin.org/social/syncedin-preview.gif", alt: "SyncedIn public portfolio" }] }
  };
}

export default async function PortfolioPage({
  params
}: {
  params: { handle: string };
}) {
  const handle = (params.handle || "").toLowerCase();
  const service = createServiceClient();

  // Split the lookup into CORE (always-present columns) and OPTIONAL
  // (portfolio_about, portfolio_theme, is_test_persona may not yet be
  // migrated on a given prod DB). Without the split, selecting a missing
  // column threw and the whole row came back null — every freshly-built
  // portfolio 404'd. Jack hit this on /u/jackson-jesionowski.
  let coreProfile:
    | {
        id: string;
        display_name: string | null;
        email: string | null;
        avatar_url: string | null;
        handle: string | null;
      }
    | null = null;
  try {
    const { data } = await service
      .from("profiles")
      .select("id, display_name, email, avatar_url, handle")
      .ilike("handle", handle)
      .maybeSingle();
    coreProfile = (data as any) ?? null;
  } catch {
    coreProfile = null;
  }

  // Fallback: if no profile matches by handle, also try matching by a
  // slug of the display_name. Catches the case where the user clicked
  // "build portfolio" but the row update silently no-op'd (schema-cache
  // miss recovery) — we can still render their page deterministically.
  if (!coreProfile) {
    try {
      const { data } = await service
        .from("profiles")
        .select("id, display_name, email, avatar_url, handle");
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      const rows = (data ?? []) as any[];
      // Exact slug match first; then prefix-tolerant so a display name with
      // a suffix ("Raghavendra Reddy · Founder" → "raghavendra-reddy-founder")
      // still resolves from a name-only link like /u/raghavendra-reddy.
      const match =
        rows.find((p) => p.display_name && norm(p.display_name) === handle) ||
        rows.find((p) => {
          if (!p.display_name) return false;
          const n = norm(p.display_name);
          return n.startsWith(`${handle}-`) || handle.startsWith(`${n}-`);
        });
      if (match) coreProfile = match;
    } catch {
      /* still null */
    }
  }

  if (!coreProfile) notFound();

  // OPTIONAL columns — fetched separately so a missing column on prod
  // doesn't take down the whole page. These were added via later
  // migrations and may not exist on every deployed DB.
  let portfolio_about: string | null = null;
  let portfolio_theme: Theme | null = null;
  let portfolio_page: PortfolioPage | null = null;
  let is_test_persona = false;
  // Split into INDIVIDUAL selects per column. The previous bundled select
  // failed silently when ANY one column was missing on a given DB, leaving
  // portfolio_page = null even when the column was fully populated (Jack's
  // /u/jackson-jesionowski rendered the legacy template even though his
  // portfolio_page had 7 sections in DB — the bundled query failed because
  // one of the other columns errored, and the try/catch around it didn't
  // catch because Supabase JS returns errors in the response object, not
  // as throws). Per-column selects make each failure isolated.
  {
    const { data: row, error } = await service
      .from("profiles")
      .select("portfolio_page")
      .eq("id", coreProfile.id)
      .maybeSingle();
    if (!error && row) {
      portfolio_page = ((row as any).portfolio_page as PortfolioPage) ?? null;
    }
  }
  {
    const { data: row, error } = await service
      .from("profiles")
      .select("portfolio_about")
      .eq("id", coreProfile.id)
      .maybeSingle();
    if (!error && row) {
      portfolio_about = ((row as any).portfolio_about as string) ?? null;
    }
  }
  {
    const { data: row, error } = await service
      .from("profiles")
      .select("portfolio_theme")
      .eq("id", coreProfile.id)
      .maybeSingle();
    if (!error && row) {
      portfolio_theme = ((row as any).portfolio_theme as Theme) ?? null;
    }
  }
  {
    const { data: row, error } = await service
      .from("profiles")
      .select("is_test_persona")
      .eq("id", coreProfile.id)
      .maybeSingle();
    if (!error && row) {
      is_test_persona = !!(row as any).is_test_persona;
    }
  }

  const profile = {
    ...coreProfile,
    portfolio_about,
    portfolio_theme,
    is_test_persona
  };

  const { data: twin } = await service
    .from("twin_profiles")
    .select(
      "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city, updated_at"
    )
    .eq("user_id", profile.id)
    .maybeSingle();

  // Owner check — only the signed-in user matching this profile sees the
  // edit affordances.
  const supabase = createClient();
  const {
    data: { user: viewer }
  } = await supabase.auth.getUser();
  const isOwner = !!viewer && viewer.id === profile.id;

  const theme: Theme = {
    ...defaultTheme(),
    ...((profile.portfolio_theme as Theme) ?? {})
  };
  const name = (profile.display_name as string) || handle;

  // CUSTOM-SITE PATH: if the user has a generated portfolio_page JSON,
  // render the rich multi-section CustomSite instead of the legacy
  // template. This is the "amazing custom website" Jack asked for —
  // every user gets a different layout, accent, section ordering.
  // Generated by /api/portfolio-generate via Claude over the full
  // twin context (twin_profiles + ai_export_blob + recent conv
  // summaries). Falls back to the legacy template below if the
  // JSON is missing or empty.
  if (portfolio_page && portfolio_page.sections?.length > 0) {
    return (
      <>
        <CustomSite
          page={portfolio_page}
          ownerId={profile.id}
          name={name}
          email={profile.email}
          handle={(profile.handle as string) ?? handle}
          avatarUrl={profile.avatar_url}
          isOwner={isOwner}
        />
        {/* #257 — MySpace-in-real-time strip. Lives ON the public
            portfolio so each visit feels alive: pulse status, what
            they're currently working on, Top 8 connections, recent
            "right now" feed. The viral hook is the page never feeling
            static. */}
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px" }}>
          <RealtimeStrip
            userId={profile.id}
            selfName={name}
            goalsHighlight={(twin as any)?.goals ?? null}
          />
        </div>
        {isOwner && <RegenerateButton hasExisting={true} />}
      </>
    );
  }

  // "Recent context" raw-scrape section removed (Jack: "on people's
  // profiles, we don't need to show recent context like the actual
  // scrape. That doesn't look good"). The ai_export_blob is still
  // used to BUILD portfolio_page via Claude — we just don't dump
  // the raw markdown chunks onto the public page anymore. The blob
  // is internal twin-context, not user-facing copy. Holding the
  // empty array so the conditional render below evaluates to nothing
  // without restructuring the JSX.
  const blocks: string[] = [];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: theme.bg
      }}
    >
      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="SyncedIn">
            <Wordmark />
          </Link>
          {isOwner ? (
            <Link
              href="/dashboard"
              className="retro-btn"
              style={{ fontSize: 12 }}
            >
              dashboard →
            </Link>
          ) : (
            <Link
              href={`/login?next=/u/${handle}`}
              className="retro-btn retro-btn-primary"
            >
              + spin up your own twin
            </Link>
          )}
        </div>

        {/* Banner band — accent color + emoji + vibe label. Reads as the
            MySpace banner without leaning on user-uploaded media (which
            we'd have to host + moderate). */}
        <div
          className="mt-6 rounded-2xl p-6 flex items-center gap-4"
          style={{
            background: theme.accent,
            color: "#ffffff",
            boxShadow: `0 8px 32px ${theme.accent}33`
          }}
        >
          <div style={{ fontSize: 56, lineHeight: 1 }}>
            {theme.banner_emoji}
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.8
              }}
            >
              {theme.vibe}
            </div>
            <h1
              className="retro-h1"
              style={{ fontSize: 36, marginTop: 4, color: "#ffffff" }}
            >
              {name}
            </h1>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Avatar
            id={profile.id}
            name={name}
            avatarUrl={profile.avatar_url}
            size={48}
          />
          <div>
            <div className="text-sm font-semibold">{name}</div>
            {(twin?.current_city || twin?.hometown) && (
              <div
                className="text-xs"
                style={{ color: "var(--text-dim)" }}
              >
                {twin?.current_city ?? ""}
                {twin?.current_city && twin?.hometown ? " · " : ""}
                {twin?.hometown ? `from ${twin.hometown}` : ""}
              </div>
            )}
          </div>
        </div>

        {profile.portfolio_about && (
          <section className="mt-6 retro-panel p-5">
            <div className="retro-label">about</div>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {profile.portfolio_about}
            </p>
          </section>
        )}

        {twin?.goals && (
          <section className="mt-4 retro-panel p-5">
            <div className="retro-label">what i'm working toward</div>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {twin.goals}
            </p>
          </section>
        )}

        {twin?.deal_preferences && (
          <section className="mt-4 retro-panel p-5">
            <div className="retro-label">looking for</div>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {twin.deal_preferences}
            </p>
          </section>
        )}

        {twin?.deal_breakers && (
          <section className="mt-4 retro-panel p-5">
            <div className="retro-label">not interested in</div>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {twin.deal_breakers}
            </p>
          </section>
        )}

        {blocks.length > 0 && (
          <section className="mt-4 retro-panel p-5">
            <div className="retro-label">recent context</div>
            <div className="mt-2 space-y-3">
              {blocks.map((b, i) => (
                <div
                  key={i}
                  className="text-xs"
                  style={{
                    color: "var(--text-dim)",
                    whiteSpace: "pre-wrap",
                    borderLeft: `2px solid ${theme.accent}66`,
                    paddingLeft: 10
                  }}
                >
                  {b.slice(0, 420)}
                  {b.length > 420 ? "…" : ""}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 retro-panel p-5">
          <div className="retro-label">talk to {name}'s twin</div>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-dim)" }}
          >
            Your twin can talk to theirs in the background to surface the
            highest-leverage overlap before either of you spends a minute
            on a call.
          </p>
          <Link
            href={isOwner ? "/dashboard" : `/login?next=/u/${handle}`}
            className="retro-btn retro-btn-primary mt-3 inline-block"
          >
            {isOwner
              ? "open dashboard"
              : `+ start a conversation with ${name.split(/\s+/)[0]}`}
          </Link>
        </section>

        {/* Owner-only editor. The full prompt-driven backend lands next
            iteration; right now this writes portfolio_about + theme.vibe
            so the page is editable today. */}
        {isOwner && (
          <PortfolioEditor
            handle={handle}
            initialAbout={(profile.portfolio_about as string) || ""}
            initialTheme={theme}
          />
        )}
      </div>
      {/* On the legacy template, give the owner a Generate button so
          they can flip to the custom Claude-designed site. Hidden for
          non-owners (they shouldn't trigger Anthropic spend). */}
      {isOwner && <RegenerateButton hasExisting={false} />}
    </main>
  );
}
