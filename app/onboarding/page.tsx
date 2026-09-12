import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../Wordmark";
import { OnboardingWizard } from "./OnboardingWizard";
import { SelfMap } from "./SelfMap";
import { LiveSyncMeter } from "./LiveSyncMeter";
import { WelcomeSplash } from "./WelcomeSplash";
import { TypingParticles } from "./TypingParticles";
import { AiExportsPanel } from "./AiExportsPanel";
import { FilesPanel } from "./FilesPanel";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: {
    saved?: string;
    welcome?: string;
    fromInvite?: string;
    conv?: string;
    error?: string;
    detail?: string;
  };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: twin } = await supabase
    .from("twin_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const { data: contactPrefs } = await supabase.from("notification_preferences")
    .select("phone_number").eq("user_id", user.id).maybeSingle();

  // Activity counts for the live sync meter — same fetches the dashboard
  // runs, so the % shown here matches the % shown on /dashboard exactly.
  // Without these the meter only saw form fields and was always lower.
  const service = createServiceClient();
  // Count REAL conversations — any conversation the user has sent ≥1
  // message in. The old status==='closed' filter under-counted by ~100%
  // because that status is rarely flipped even after sealed agreements.
  const { data: myMessageConvs } = await service
    .from("messages")
    .select("conversation_id")
    .eq("sender_user_id", user.id);
  const completedConversations = new Set(
    ((myMessageConvs ?? []) as Array<{ conversation_id: string }>).map(
      (m) => m.conversation_id
    )
  ).size;
  const { count: acceptedAgreementsCount } = await service
    .from("agreement_responses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("response", "accepted");
  const { count: editCount } = await service
    .from("edit_deltas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const initial = {
    display_name: profile?.display_name ?? "",
    phone_number: contactPrefs?.phone_number ?? "",
    goals: twin?.goals ?? "",
    deal_preferences: twin?.deal_preferences ?? "",
    communication_style: twin?.communication_style ?? "",
    deal_breakers: twin?.deal_breakers ?? "",
    ai_export_blob: twin?.ai_export_blob ?? "",
    avatar_url: profile?.avatar_url ?? "",
    hometown: (twin as any)?.hometown ?? "",
    current_city: (twin as any)?.current_city ?? "",
    achievements: (twin as any)?.achievements ?? ""
  };

  // Welcome-splash data — only used when ?welcome=1 is in the URL (set
  // either by /auth/callback for brand-new signups or by /claim/<slug>
  // for invite-claimed users). Pulls the inviter display name from the
  // pending_invite if a slug was passed so we can show "Jack already has
  // a conversation waiting for you."
  const showWelcome = searchParams.welcome === "1";
  let inviterName: string | null = null;
  if (showWelcome && searchParams.fromInvite) {
    const { data: invite } = await service
      .from("pending_invites")
      .select("inviter_user_id")
      .eq("slug", searchParams.fromInvite)
      .maybeSingle();
    if (invite?.inviter_user_id) {
      const { data: ip } = await service
        .from("profiles")
        .select("display_name, email")
        .eq("id", invite.inviter_user_id)
        .maybeSingle();
      inviterName =
        (ip as any)?.display_name ||
        ((ip as any)?.email ? (ip as any).email.split("@")[0] : null);
    }
  }
  const firstNameForWelcome = (initial.display_name || "").trim().split(/\s+/)[0] || "";

  return (
    <main className="max-w-6xl mx-auto px-6 pt-1 pb-8">
      {/* Glowing-dot particles that fly from inputs toward the SyncMeter
          whenever the user types. Pure DOM + CSS, respects reduced
          motion. Mounted at page level so it sees the form + meter. */}
      <TypingParticles />
      {/* Top nav row — collapsed even tighter. Was minHeight:32 + mt-6 +
          mt-3 + retro-h1, so the wizard sat ~140px down from the viewport
          top. Killed the H1 + subhead block entirely (the in-step labels
          + step pills already announce what page they're on) and shrank
          the nav strip so step 1 lands almost flush with the top. */}
      <div
        className="flex items-center justify-between"
        style={{ minHeight: 28 }}
      >
        <Wordmark />
        <Link href="/dashboard" className="retro-dim text-xs">
          dashboard &gt;
        </Link>
      </div>

      {showWelcome && (
        <WelcomeSplash
          firstName={firstNameForWelcome}
          avatarUrl={initial.avatar_url || null}
          inviterName={inviterName}
          conversationId={searchParams.conv || null}
        />
      )}

      {searchParams.saved === "1" && (
        <p className="mt-2 text-sm retro-green">✓ Saved.</p>
      )}
      {searchParams.error && (
        <p className="mt-2 text-sm retro-red">
          {searchParams.detail
            ? decodeURIComponent(searchParams.detail)
            : "Add a valid phone number before saving."}
        </p>
      )}

      <div className="mt-3 grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        <div className="min-w-0">
          <OnboardingWizard initial={initial} userId={user.id} />
          {/* Multi-source AI context uploader — the "king" twin-context
              feature. Lets the user paste deep self-descriptions from
              ChatGPT / Claude / Gemini / Perplexity separately, each
              with its own tuned prompt. Mounted below the main wizard
              so it shows up but doesn't steal the primary flow. */}
          <div style={{ marginTop: 24 }}>
            <AiExportsPanel />
            <FilesPanel />
          </div>
        </div>

        {/* Right rail — live SyncMeter (sci-fi-upload power core). Fills
            in real time as the user adds context. Replaces the old
            SelfGraph here; the topographic visual now lives at the
            bottom of the page where it can render full-width. The
            data-sync-meter attr is the target for the typing particles
            so they fly toward this element regardless of viewport. */}
        <div data-sync-meter>
          {/* Sized smaller (150) so the Clone Sync widget fits under
              the right rail without scrolling on a standard full-screen
              viewport — Jack: "make the clone sync small enough that
              it can be under the menu itself and still be visible on a
              standard full screen mode." */}
          <LiveSyncMeter
            formSelector="#onboarding-form"
            size={150}
            completedConversations={completedConversations}
            acceptedAgreements={acceptedAgreementsCount ?? 0}
            editCount={editCount ?? 0}
          />
        </div>
      </div>

      {/* Map of self at the bottom — full-width psychometric portrait
          (Big Five radar + Schwartz values + SDT drives + narrative
          identity). Renders only when the user has some context;
          otherwise the placeholder lives inside SelfMap itself. */}
      <section className="mt-12">
        <SelfMap formSelector="#onboarding-form" />
      </section>
    </main>
  );
}
