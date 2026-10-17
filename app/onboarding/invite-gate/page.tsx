import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../../Wordmark";
import { BulkReachToolkit } from "../../BulkReachToolkit";

/**
 * Invite gate — new users must draft at least 2 personalized invites before
 * the dashboard unlocks. SyncedIn only works if the people each member
 * actually wants to coordinate with come in too.
 */
export default async function InviteGatePage() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const { count } = await service
    .from("pending_invites")
    .select("slug", { count: "exact", head: true })
    .eq("inviter_user_id", user.id);
  const drafted = count ?? 0;

  // If they've already met the gate, send them to /dashboard directly.
  if (drafted >= 2) redirect("/dashboard");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  const remaining = Math.max(0, 2 - drafted);

  return (
    <main className="max-w-3xl mx-auto px-6 pt-4 pb-8">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link href="/onboarding" className="retro-dim text-xs">
          edit twin &lt;
        </Link>
      </div>

      <section className="mt-10">
        <div className="retro-label">unlock the dashboard</div>
        <h1 className="retro-h1 text-3xl mt-3 leading-tight">
          Draft {remaining} personalized invite
          {remaining === 1 ? "" : "s"} to unlock SyncedIn.
        </h1>
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: "var(--text-dim)", maxWidth: 640 }}
        >
          The hypernetwork only works once the people you actually want to
          coordinate with are inside. Pick two real humans below — full name,
          email — and we&apos;ll generate a custom landing page for each.
          Send via iMessage, WhatsApp, Signal, or email. You only have to do
          this once.
        </p>

        <div className="mt-4 retro-panel p-4 inline-flex items-center gap-3">
          <div
            className="retro-label"
            style={{ color: "var(--amber-bright)" }}
          >
            progress
          </div>
          <div
            className="font-mono text-lg"
            style={{ color: "var(--text)" }}
          >
            {drafted} / 2
          </div>
          <div className="text-xs retro-dim">
            {remaining === 0
              ? "✓ ready"
              : `${remaining} to go`}
          </div>
        </div>
      </section>

      <div className="mt-8">
        <BulkReachToolkit appUrl={appUrl} variant="card" />
      </div>

      <div className="mt-8 text-center">
        {drafted >= 2 ? (
          <Link href="/dashboard" className="retro-btn retro-btn-primary">
            → enter dashboard
          </Link>
        ) : (
          // Server-component-safe: a plain disabled button, no onClick.
          // (The previous version passed `onClick` to a Link inside a server
          // component, which Next.js 14 hard-errors on with "Event handlers
          // cannot be passed to Client Component props" — that was 500ing
          // every brand-new signup that landed here.)
          <button
            type="button"
            disabled
            className="retro-btn retro-btn-primary"
            style={{ opacity: 0.4, cursor: "not-allowed" }}
            aria-disabled
          >
            {remaining} more invite{remaining === 1 ? "" : "s"} to unlock
          </button>
        )}
      </div>
    </main>
  );
}
