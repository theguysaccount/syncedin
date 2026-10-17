import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";

export const dynamic = "force-dynamic";

/**
 * /welcome — the post-claim "wait, they already know me" moment.
 *
 * New users invited via /<slug> land here AFTER /claim/[slug] has created
 * their conversation and pre-filled their profile + twin. This page is the
 * antidote to "I feel like I'm getting interrogated by the FBI" — instead
 * of dropping them into a 4-step wizard, we show them:
 *
 *   1. "Welcome, <real name>" — with their own photo if we scraped it.
 *   2. The data we already have — bio, captions, platform. Proof we paid
 *      attention before sending them an invite.
 *   3. Three explainer cards covering how SyncedIn works.
 *   4. ONE CTA: "Open my conversation with <inviter>" — sends them to the
 *      thread that's already populated with the inviter's opener. They
 *      don't have to do ANYTHING before getting value.
 *
 * The wizard is still available at /onboarding for users who want to
 * refine their twin. It's not the default path anymore.
 */
export default async function WelcomePage(
  props: {
    searchParams: Promise<{ conv?: string; from?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const convId = (searchParams.conv ?? "").trim();
  const fromSlug = (searchParams.from ?? "").trim();

  const service = createServiceClient();

  const [{ data: profile }, { data: twin }] = await Promise.all([
    service
      .from("profiles")
      .select("display_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("twin_profiles")
      .select("ai_export_blob")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);
  const displayName =
    profile?.display_name || profile?.email?.split("@")[0] || "there";
  const firstName = displayName.split(/\s+/)[0];
  const avatarUrl = (profile as any)?.avatar_url || null;
  const seededBlob = ((twin as any)?.ai_export_blob || "").trim();

  // Inviter info — used in the CTA so they know who's waiting.
  let inviterName: string | null = null;
  let inviterAvatar: string | null = null;
  if (fromSlug) {
    const { data: invite } = await service
      .from("pending_invites")
      .select("inviter_user_id")
      .eq("slug", fromSlug)
      .maybeSingle();
    if (invite?.inviter_user_id) {
      const { data: inv } = await service
        .from("profiles")
        .select("display_name, email, avatar_url")
        .eq("id", invite.inviter_user_id)
        .maybeSingle();
      inviterName =
        inv?.display_name || inv?.email?.split("@")[0] || "their twin";
      inviterAvatar = (inv as any)?.avatar_url || null;
    }
  }

  const ctaHref = convId ? `/conversations/${convId}` : "/dashboard";

  return (
    <AppShell>
      {/* HERO — "we know you" */}
      <section className="mt-4">
        <div className="retro-label">welcome to syncedin</div>
        <h1 className="retro-h1 text-4xl sm:text-5xl mt-3 leading-tight">
          {firstName}, your twin is already half-built.
        </h1>
        <p
          className="mt-5 text-base sm:text-lg leading-relaxed"
          style={{ color: "var(--text-dim)", maxWidth: 760 }}
        >
          Before {inviterName ?? "the inviter"} sent the invite, we read what
          you&apos;ve already put on the public internet and used it to
          shape your twin&apos;s starting point. You don&apos;t need to fill
          out a profile to use SyncedIn — there&apos;s already one waiting
          for you.
        </p>

        <div className="mt-8 flex items-center gap-5 flex-wrap">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              width={96}
              height={96}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                border: "3px solid var(--amber)",
                boxShadow: "0 8px 28px -8px rgba(58,77,255,0.55)",
                objectFit: "cover"
              }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: "var(--panel-2)",
                border: "3px solid var(--amber)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: 700,
                color: "var(--text)"
              }}
            >
              {firstName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="font-semibold text-xl"
              style={{ color: "var(--text)" }}
            >
              {displayName}
            </div>
            <div
              className="text-sm mt-1"
              style={{ color: "var(--text-dim)" }}
            >
              Your face and your real name — already on your twin.
            </div>
          </div>
        </div>
      </section>

      {/* SCRAPED CONTEXT — "look what we know" */}
      {seededBlob.length > 60 && (
        <section className="mt-12">
          <div className="retro-label">what your twin already knows</div>
          <h2 className="retro-h1 text-2xl mt-2">
            Pulled from your public footprint.
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-dim)", maxWidth: 640 }}
          >
            This is the rough draft. You can edit any of it later, but it&apos;s
            enough for your twin to hold a real conversation right now.
          </p>
          <div
            className="mt-4 retro-panel"
            style={{
              padding: 18,
              borderColor: "var(--amber)",
              maxHeight: 240,
              overflow: "hidden",
              position: "relative",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre-wrap"
            }}
          >
            {seededBlob.slice(0, 1200)}
            {seededBlob.length > 1200 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 80,
                  background:
                    "linear-gradient(180deg, transparent 0%, var(--panel-solid) 90%)",
                  pointerEvents: "none"
                }}
              />
            )}
          </div>
        </section>
      )}

      {/* THREE EXPLAINER CARDS — "how this works" */}
      <section className="mt-12">
        <div className="retro-label">how syncedin works</div>
        <h2 className="retro-h1 text-2xl mt-2">
          Three things to know before you walk in.
        </h2>
        <div className="mt-6 grid sm:grid-cols-3 gap-5">
          <Explainer
            k="01"
            t="Your twin talks for you"
            d="When someone sends a message, your twin reads their profile + intent and drafts a reply in your voice. You see every draft before it sends — nothing goes out without your blessing."
          />
          <Explainer
            k="02"
            t="Both twins find the win-win"
            d="Two twins negotiate quietly before you and the other human ever meet. By the time you read the thread, it's down to the one or two proposals that actually fit both of you."
          />
          <Explainer
            k="03"
            t="You only see what matters"
            d="The platform surfaces ranked outcomes per conversation — sealed deals at the top, ghost-likely at the bottom. No inbox to clear. Just signals to act on."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="mt-14 mb-10">
        <div
          className="retro-panel"
          style={{
            padding: 28,
            borderColor: "var(--amber)",
            background:
              "radial-gradient(900px 500px at 30% 0%, rgba(58,77,255,0.08), transparent 60%), radial-gradient(800px 400px at 80% 100%, rgba(160,96,255,0.08), transparent 60%), var(--panel-solid)"
          }}
        >
          <div className="flex items-center gap-4 flex-wrap">
            {inviterAvatar && (
              <img
                src={inviterAvatar}
                alt={inviterName ?? ""}
                width={56}
                height={56}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  border: "2px solid var(--border-bright)",
                  objectFit: "cover"
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div
                className="retro-label"
                style={{ color: "var(--amber-bright)" }}
              >
                your first conversation
              </div>
              <h3
                className="retro-h1 text-2xl mt-1"
                style={{ lineHeight: 1.2 }}
              >
                {inviterName
                  ? `${inviterName}'s twin is waiting on yours.`
                  : "Open your first conversation."}
              </h3>
              <p
                className="text-sm mt-2"
                style={{ color: "var(--text-dim)", maxWidth: 520 }}
              >
                The thread is already populated with the opener.
                {inviterName ? ` Reply through your twin to see how the negotiation flows.` : ""}
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Link
              href={ctaHref}
              className="retro-btn retro-btn-primary"
              style={{ padding: "12px 22px" }}
            >
              {inviterName
                ? `→ Open my conversation with ${inviterName.split(" ")[0]}`
                : "→ Open my conversation"}
            </Link>
            <Link
              href="/onboarding"
              className="retro-btn text-sm"
              style={{ padding: "10px 16px" }}
            >
              refine my twin first
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Explainer({
  k,
  t,
  d
}: {
  k: string;
  t: string;
  d: string;
}) {
  return (
    <div className="retro-panel" style={{ padding: "22px 24px" }}>
      <div className="retro-amber text-xs font-bold">{k}</div>
      <div className="mt-2 font-semibold text-base">{t}</div>
      <div
        className="mt-2 retro-dim text-sm"
        style={{ lineHeight: 1.6 }}
      >
        {d}
      </div>
    </div>
  );
}
