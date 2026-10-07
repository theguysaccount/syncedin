import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";
// PortfolioCard removed — portfolio lives on /personal-intelligence now.
import { ChangePasswordCard } from "./ChangePasswordCard";
import { DeleteAccountCard } from "./DeleteAccountCard";
import { BlockedAccounts } from "./BlockedAccounts";

/**
 * Unified /settings page. Replaces the lone /settings/notifications
 * landing with a single hub that covers: notification preferences,
 * password change, account deletion, and a card showing the user's
 * personal /u/<handle> portfolio so they can copy + open it without
 * having to remember the URL.
 *
 * Sidebar should link here (single "Settings" item) rather than
 * deep-linking to /settings/notifications — the nested toggles still
 * live at /settings/notifications, this page just routes there.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, display_name, email, handle, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data: blocks } = await service.from("user_blocks").select("blocked_id").eq("blocker_id", user.id);
  const ids = (blocks ?? []).map(row => row.blocked_id);
  const { data: blockedProfiles } = ids.length ? await service.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const blockedAccounts = (blockedProfiles ?? []).map(row => ({ id: row.id, name: row.display_name || "Blocked account" }));
  return (
    <AppShell>
      <header style={{ marginBottom: 18 }}>
        <h1 className="retro-h1 text-2xl">Settings</h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-dim)" }}
        >
          One place for your notifications, security, account, and the
          public-facing portfolio your twin builds for you.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 14
        }}
        className="settings-grid"
      >
        <style>{`
          @media (min-width: 900px) {
            .settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .settings-grid > .settings-card-wide { grid-column: 1 / -1; }
          }
          .settings-card {
            padding: 18px;
            border-radius: 16px;
            border: 1px solid var(--border);
            background: var(--panel-solid);
          }
          .settings-card h2 {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: -0.005em;
            margin: 0 0 6px;
          }
          .settings-card p.hint {
            font-size: 13px;
            line-height: 1.5;
            color: var(--text-dim);
            margin: 0 0 14px;
          }
          .settings-row-link {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            border-radius: 10px;
            background: var(--panel-2);
            border: 1px solid var(--border);
            text-decoration: none;
            color: var(--text);
            font-size: 13.5px;
            font-weight: 600;
            transition: border-color 0.15s ease;
          }
          .settings-row-link:hover { border-color: #1f8bff; }
          .settings-row-link .arrow {
            color: #1f8bff;
            font-size: 16px;
          }
        `}</style>

        {/* Portfolio section removed — now lives on /personal-intelligence
            as the first card. One-click build there opens the page
            directly instead of routing back here. */}

        {/* Notifications — links out to the existing detailed page. */}
        <section className="settings-card">
          <h2>Notifications and phone</h2>
          <p className="hint">
            Decide which moments reach your inbox: new connections,
            sealed agreements, high-match new signups. Default is
            on-but-debounced.
          </p>
          <Link href="/settings/notifications" className="settings-row-link">
            <span>Open notification settings</span>
            <span className="arrow">→</span>
          </Link>
        </section>

        {/* Change password */}
        <section className="settings-card"><h2>Blocked accounts</h2><BlockedAccounts accounts={blockedAccounts} /></section>
        <section className="settings-card">
          <h2>Change password</h2>
          <p className="hint">
            Set a new password — we&apos;ll sign you out of all devices
            and send a confirmation email.
          </p>
          <ChangePasswordCard />
        </section>

        {/* Delete account — full width, destructive. */}
        <section className="settings-card settings-card-wide">
          <h2 style={{ color: "#ef4444" }}>Delete account</h2>
          <p className="hint">
            Permanently remove your twin, all conversations you started,
            and all data we&apos;ve scraped on you. This cannot be
            undone. Conversations you participated in stay visible to
            the other side (with your name redacted) so they aren&apos;t
            broken by your departure.
          </p>
          <DeleteAccountCard
            email={user.email || ""}
            displayName={(profile as any)?.display_name || ""}
          />
        </section>
      </div>
    </AppShell>
  );
}
