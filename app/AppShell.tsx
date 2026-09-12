import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileShell } from "./MobileShell";
import { SitewidePrefetch } from "./SitewidePrefetch";
import { SyncMeter } from "./SyncMeter";
import { ThemeSync } from "./ThemeSync";
import { PushRegistrar } from "./PushRegistrar";
import { signOut } from "./login/actions";

/**
 * AppShell — wraps every signed-in page with the persistent left sidebar.
 * The sidebar holds the logo, primary actions ("+ new"), nav, conferences,
 * theme toggle, and sign out — so the main column starts immediately with
 * page content, no chrome bar above it.
 *
 * Server component so the auth check + profile + conferences fetch run on
 * the edge before any client JS hydrates.
 */
export async function AppShell({
  children,
  // All AppShell pages share the SAME outer width so the sidebar's left
  // edge is identical from page to page. Without this, navigating between
  // a max-w-6xl page and a max-w-7xl page made the whole sidebar jump
  // horizontally — the user's eye lost its anchor on every nav.
  maxWidth = "max-w-7xl",
  sidebarExtra
}: {
  children: React.ReactNode;
  maxWidth?: string;
  sidebarExtra?: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Capture userId locally so the helpers below + every reference here
  // have a non-nullable reference (TS doesn't carry the narrowing from
  // the redirect check into nested async functions).
  const userId = user.id;
  // Founder-only flag — gates the Admin nav link. /admin pages are also
  // hard-gated server-side, so this only controls link visibility.
  const isAdmin = user.email?.toLowerCase() === "jacksonjezio@gmail.com";

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, email, handle")
    .eq("id", userId)
    .maybeSingle();

  // Display name fallback chain. Jack: "It says Jackson J-E-Z-I-O,
  // but it should just say Jackson Jesionowski."
  // Order:
  //   1. profiles.display_name (real name set in onboarding)
  //   2. twin_profiles.ai_export_blob doesn't help here (no name field)
  //   3. email username prettified — "jacksonjezio" → "Jacksonjezio"
  //   4. "you" as last resort
  function prettifyEmailUsername(raw: string): string {
    // Split on common separators + camelCase boundaries.
    const parts = raw
      .replace(/[._-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return parts
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" ");
  }
  const emailUsername = user.email?.split("@")[0] ?? "";
  const displayName =
    (profile?.display_name && profile.display_name.trim()) ||
    (emailUsername ? prettifyEmailUsername(emailUsername) : "you");

  // Conferences in the sidebar — fetched in two safe steps so a transient
  // join failure or a missing FK relationship hint can't crash the entire
  // shell (which would 500 every signed-in page). If anything throws, the
  // sidebar just renders without the "Your conferences" section.
  let conferences: { slug: string; name: string }[] = [];
  try {
    const { data: memberRows } = await supabase
      .from("conference_members")
      .select("conference_slug")
      .eq("user_id", userId);
    const slugs = (memberRows ?? []).map((r: any) => r.conference_slug);
    if (slugs.length > 0) {
      const { data: confs } = await supabase
        .from("conferences")
        .select("slug, name")
        .in("slug", slugs);
      conferences = (confs ?? []).map((c: any) => ({
        slug: c.slug as string,
        name: c.name as string
      }));
    }
  } catch (e) {
    console.warn("[AppShell] conferences sidebar fetch failed", e);
  }

  // === Unread counts for the sidebar's red badges ===
  // Three counts: /messages (a message from the other side arrived
  // after my last_read), /poll (a poll exists I haven't responded
  // to), and pending proposals (folded into /messages since proposals
  // now live inside the merged inbox).
  //
  // Parallelized May 2026 (Jack: "jitteriness when clicking around
  // the menu and it's like reloading items"). Previously these three
  // blocks ran sequentially, costing ~3x the round-trip latency on
  // every page navigation. Now Promise.allSettled fires them in
  // parallel so the shell renders in one round-trip's time.
  const unreadCounts: Record<string, number> = {};

  async function computeMessagesUnread(): Promise<number> {
    const { data: convs } = await supabase
      .from("conversations")
      .select(
        "id, participant_a, participant_b, last_read_a, last_read_b, created_at"
      )
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`);
    const myConvs = (convs ?? []) as any[];
    const convIds = myConvs.map((c) => c.id);
    if (convIds.length === 0) return 0;
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, sender_user_id, sent_at")
      .in("conversation_id", convIds)
      .neq("sender_user_id", userId)
      .order("sent_at", { ascending: false });
    const latestByConv = new Map<string, string>();
    for (const m of ((msgs ?? []) as any[])) {
      if (!latestByConv.has(m.conversation_id)) {
        latestByConv.set(m.conversation_id, m.sent_at);
      }
    }
    let n = 0;
    for (const c of myConvs) {
      const isA = c.participant_a === userId;
      const myLastRead = isA ? c.last_read_a : c.last_read_b;
      const latest = latestByConv.get(c.id);
      if (!latest) continue;
      if (!myLastRead || new Date(latest) > new Date(myLastRead)) n += 1;
    }
    return n;
  }

  async function computePollUnread(): Promise<number> {
    // Jack: "lets add to the polls page when a new poll that their
    // twin reacts to is there." Badge counts polls where the user's
    // TWIN has posted a response but the user hasn't human-overridden
    // it yet — i.e., they haven't engaged with what their twin said
    // on their behalf. (Previous logic counted polls the user owed a
    // response on, which dropped to 0 the moment the twin auto-
    // responded — exactly the opposite of what Jack wants.)
    const { data: polls } = await supabase
      .from("polls")
      .select("id, status")
      .neq("status", "closed");
    const pollIds = ((polls ?? []) as any[]).map((p) => p.id);
    if (pollIds.length === 0) return 0;
    let rows: Array<{ poll_id: string; was_overridden: boolean | null }> = [];
    try {
      const { data } = await supabase
        .from("poll_responses")
        .select("poll_id, was_overridden")
        .eq("twin_user_id", userId)
        .in("poll_id", pollIds);
      rows = (data ?? []) as any;
    } catch {
      // was_overridden column may not exist — degrade to "twin
      // responded at all" as the unread signal.
      const { data } = await supabase
        .from("poll_responses")
        .select("poll_id")
        .eq("twin_user_id", userId)
        .in("poll_id", pollIds);
      rows = ((data ?? []) as any[]).map((r) => ({
        ...r,
        was_overridden: null
      }));
    }
    return rows.filter((r) => !r.was_overridden).length;
  }

  async function computeProposalsUnread(): Promise<number> {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, participant_a, participant_b, summary")
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .not("summary", "is", null);
    const convIds = ((convs ?? []) as any[]).map((c) => c.id);
    if (convIds.length === 0) return 0;
    const { data: myResps } = await supabase
      .from("agreement_responses")
      .select("conversation_id")
      .eq("user_id", userId)
      .in("conversation_id", convIds);
    const respondedSet = new Set(
      ((myResps ?? []) as any[]).map((r) => r.conversation_id)
    );
    return convIds.filter((id: string) => !respondedSet.has(id)).length;
  }

  const [msgRes, pollRes, propRes] = await Promise.allSettled([
    computeMessagesUnread(),
    computePollUnread(),
    computeProposalsUnread()
  ]);
  const messageUnread =
    (msgRes.status === "fulfilled" ? msgRes.value : 0) +
    (propRes.status === "fulfilled" ? propRes.value : 0);
  if (messageUnread > 0) unreadCounts["/messages"] = messageUnread;
  if (pollRes.status === "fulfilled" && pollRes.value > 0)
    unreadCounts["/poll"] = pollRes.value;

  // === SYNC METER inputs ===
  // Pulled INTO AppShell (was per-page via sidebarExtra) so the meter
  // renders on EVERY signed-in page from one source — preloaded, no
  // re-mount jitter on navigation, scrolls inside the sticky sidebar
  // as one block. Jack: "SYNC AVATAR WEIRDLY SCROLLS TOO, IT SHOULD
  // BE IN THE SAME SCROLL SECTION AS THE MENU."
  const service = createServiceClient();
  const [
    { data: twinForMeter },
    { data: myMsgsForMeter },
    { count: agreedForMeter },
    { count: editsForMeter }
  ] = await Promise.all([
    service
      .from("twin_profiles")
      .select(
        "goals, ai_export_blob, deal_preferences, communication_style, deal_breakers, hometown, current_city"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("messages")
      .select("conversation_id")
      .eq("sender_user_id", userId),
    service
      .from("agreement_responses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("response", "accepted"),
    service
      .from("edit_deltas")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
  ]);
  const completedConvs = new Set(
    ((myMsgsForMeter ?? []) as Array<{ conversation_id: string }>).map(
      (m) => m.conversation_id
    )
  ).size;
  const syncInputs = {
    name: displayName,
    goals: (twinForMeter as any)?.goals ?? null,
    ai_export_blob: (twinForMeter as any)?.ai_export_blob ?? null,
    deal_preferences: (twinForMeter as any)?.deal_preferences ?? null,
    comm_style: (twinForMeter as any)?.communication_style ?? null,
    deal_breakers: (twinForMeter as any)?.deal_breakers ?? null,
    hometown: (twinForMeter as any)?.hometown ?? null,
    current_city: (twinForMeter as any)?.current_city ?? null,
    completed_conversations: completedConvs,
    accepted_agreements: agreedForMeter ?? 0,
    edit_count: editsForMeter ?? 0
  };

  // Clone-sync card rendered INSIDE the Sidebar (passed via the new
  // `cloneCard` prop) so it sits inside the one sticky aside and
  // scrolls/sticks as one block with the nav. Identical on every page.
  const cloneCard = (
    <aside
      style={{
        // Lives inside the sidebar aside — no own background/border;
        // the sidebar's panel already provides the surface.
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        paddingTop: 8,
        borderTop: "1px solid var(--border)"
        // NOTE: NO overflow:hidden here. The SyncMeter's (i) hover
        // tooltip opens to the right; clipping the wrapper hid the
        // tooltip behind the conversation cards next to the sidebar
        // (Jack: "HOVER ON SYNC GOES BEHIND ELEMENTS"). The meter's
        // drop-shadow is already capped at 24px in SyncMeter.tsx so
        // it can't bleed into the nav.
      }}
    >
      <SyncMeter inputs={syncInputs} size={110} />
      <Link
        href="/onboarding"
        className="retro-btn retro-btn-primary text-center"
        style={{
          width: "100%",
          fontSize: 11,
          padding: "7px 10px"
        }}
      >
        + add context
      </Link>
    </aside>
  );

  // Render the Sidebar ONCE — it gets handed both to the desktop slot
  // (hidden < lg) and to the MobileShell drawer (hidden ≥ lg) so the same
  // server-fetched data backs both surfaces. The cloneCard ships inside
  // it as a child so there's only one sticky block on desktop.
  const sidebar = (
    <Sidebar
      userId={userId}
      displayName={displayName}
      avatarUrl={(profile as any)?.avatar_url ?? null}
      signOutAction={signOut}
      conferences={conferences}
      unreadCounts={unreadCounts}
      cloneCard={cloneCard}
    />
  );

  return (
    <>
      {/* Keeps the theme consistent across every navigation (no more
          light/dark flips between pages). */}
      <ThemeSync />
      <PushRegistrar />
      {/* Mobile chrome — hamburger top bar + slide-in drawer holding the
          full sidebar. Hidden on lg+. Pass userId/name/avatar so the
          top-right of the mobile bar renders the user's avatar as a
          link to /settings (Jack: "right now I can't get to settings"
          on mobile). */}
      <MobileShell
        userId={userId}
        displayName={displayName}
        avatarUrl={(profile as any)?.avatar_url ?? null}
      >
        {sidebar}
      </MobileShell>

      {/* Warm the router cache for every primary nav destination so
          clicks anywhere in the app feel instant. Mounted ONCE per
          authed page via AppShell so the prefetch only fires for
          signed-in users (where the routes are reachable). */}
      <SitewidePrefetch />

      {/* Desktop top bar — hypernetwork, sync a conference, sync a
          community lift up here. Profile avatar lives top-right with
          a dropdown for Edit twin / Settings / Sign out. Hidden on
          mobile because MobileShell already owns the top strip there. */}
      <div className="hidden lg:block">
        <TopBar
          userId={userId}
          displayName={displayName}
          avatarUrl={(profile as any)?.avatar_url ?? null}
          portfolioHandle={(profile as any)?.handle ?? null}
          signOutAction={signOut}
          unreadCounts={unreadCounts}
          isAdmin={isAdmin}
        />
      </div>

      {/* pt-0 on mobile because MobileShell already gives us a top bar.
          Stacking another pt-3 below it created the huge empty band Jack
          flagged. lg+ keeps the standard pt-3 since there's no mobile bar
          eating vertical real estate up top.
          —
          Flush-left sidebar (Jack: "Let's move the menu all the way to
          the left of the screen"). On lg+ we drop the left padding +
          the max-w gutter so the sidebar sits against the viewport edge.
          The main content keeps its readable max-width via its own
          inner wrapper. */}
      <main
        // overflow-x: hidden + max-w-full mirror the global guard but
        // scope it to the AppShell column too — belt-and-suspenders
        // against any page-level content that briefly inflates before
        // its own min-w-0 catches up.
        style={{ maxWidth: "100vw", overflowX: "hidden" }}
        className={`mx-auto px-4 lg:pl-4 lg:pr-5 pt-0 lg:pt-1 pb-6 grid lg:grid-cols-[200px_1fr] gap-4 lg:gap-6 items-start ${maxWidth} lg:max-w-none`}
      >
        {/* Desktop sidebar — hidden on mobile, replaced by MobileShell drawer.
            Sticky on lg+ so it stays in view as the main content scrolls.
            top:12 leaves a hair of breathing room below the viewport top;
            maxHeight + overflow keep tall sidebars (lots of conferences)
            from going off the bottom of the screen. */}
        {/* Desktop sidebar column. CRITICAL: use the className for
            display, NOT inline style — inline `display: flex` was
            overriding the `hidden` class on mobile, causing the
            CloneSync card to render through the drawer overlay
            (Jack: "MOBILE VIEW VERY BROKEN" screenshots). Now we use
            lg:flex so the column is genuinely display:none on mobile. */}
        <div
          className="hidden lg:flex lg:flex-col"
          style={{
            position: "sticky",
            top: 12,
            alignSelf: "start",
            // Establish a stacking context above the main content
            // column so the SyncMeter (i) hover tooltip — which lives
            // inside this aside and pops out to the right — renders
            // ON TOP of the conversation cards next to it.
            zIndex: 5
          }}
        >
          {sidebar}
          {/* sidebarExtra prop is now ignored — kept on the API for
              back-compat with pages that still pass it. The clone-sync
              card lives INSIDE the Sidebar so the whole block is one
              sticky aside. */}
        </div>

        <div className="min-w-0">{children}</div>
      </main>
    </>
  );
}
