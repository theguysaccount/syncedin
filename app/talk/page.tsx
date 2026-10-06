import { withHomeVariantSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "../Wordmark";
import { TalkChat } from "./TalkChat";
import { type OrbitUser } from "../OrbitingPlatformUsers";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * /talk — chat-landing variant. The "talking to the master model of
 * the platform" interface Jack greenlit for the A/B test against /.
 *
 * Public, no auth. Middleware routes 50% of new visitors here via
 * cookie split. Microsoft Clarity captures the conversion delta vs
 * the handle-picker hero at /.
 *
 * Architecture:
 *  - Server: renders the shell + intro
 *  - Client: streaming chat that POSTs to /api/talk
 *  - API: Claude Haiku w/ tool access (search_users, scrape_handle,
 *    match_preview, start_signup)
 */
export const metadata: Metadata = withHomeVariantSEO('/talk', {
  title: "Chat with SyncedIn — find who you should talk to",
  description:
    "Talk to the SyncedIn master AI. See who's on the platform, get matched live, sign up only when you're ready."
});

export default async function TalkLandingPage() {
  // Pull real platform users for the orbit + a count for the "N+
  // already syncing" caption. Best-effort; silently degrades to an
  // empty orbit if the query fails.
  let orbitUsers: OrbitUser[] = [];
  let totalCount = 0;
  try {
    const service = createServiceClient();
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("is_test_persona", true);
    totalCount = count ?? 0;
    const { data: rows } = await service
      .from("profiles")
      .select("id, display_name, avatar_url, handle, bio, portfolio_about")
      .neq("is_test_persona", true)
      .not("avatar_url", "is", null)
      .not("avatar_url", "ilike", "%dicebear%")
      .not("avatar_url", "ilike", "%robohash%")
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(15);
    orbitUsers = ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name:
        (r.display_name as string) ||
        (r.handle as string) ||
        "Someone",
      avatar_url: r.avatar_url as string | null,
      handle: r.handle as string | null,
      achievement:
        (r.bio as string | null)?.slice(0, 140) ??
        (r.portfolio_about as string | null)?.split("\n")[0]?.slice(0, 140) ??
        null
    }));
  } catch {
    /* render without orbit users */
  }

  return (
    <main
      style={{
        // height (not minHeight) is what lets the inner chat scroller
        // actually scroll. With minHeight the flex child can grow
        // beyond the viewport and overflow:auto never engages.
        // 100dvh handles mobile address-bar resizing.
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden"
      }}
    >
      <h1 className="sr-only">Chat with SyncedIn</h1>
      {/* Top bar — wordmark left, sign-in right. Kept thin so the
          chat surface dominates the viewport. */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 22px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0
        }}
      >
        <Link
          href="/"
          aria-label="SyncedIn"
          style={{ textDecoration: "none" }}
        >
          <Wordmark size="md" />
        </Link>
        <Link
          href="/login"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-dim)",
            textDecoration: "none"
          }}
        >
          Sign in
        </Link>
      </header>

      {/* TalkChat owns the 3-col layout now: orbit + recent-users list
          in the left rail, chat in the center, live tool-use feed in
          the right rail. On mobile it collapses to a single column. */}
      <TalkChat orbitUsers={orbitUsers} totalCount={totalCount} />
    </main>
  );
}
