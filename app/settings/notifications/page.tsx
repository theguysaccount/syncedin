import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { saveNotificationPrefs } from "./actions";
import { NotifPrefsForm } from "./NotifPrefsForm";
import { AppShell } from "../../AppShell";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage({
  searchParams
}: {
  searchParams: { saved?: string; error?: string; detail?: string };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    service
      .from("profiles")
      .select("email, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  const initial = {
    email_address: prefs?.email_address ?? profile?.email ?? "",
    phone_number:
      (prefs as any)?.phone_number ?? "",
    on_text_notifications: (prefs as any)?.on_text_notifications ?? true,
    preferred_messaging_service:
      (prefs as any)?.preferred_messaging_service ?? "iMessage",
    on_new_connection: prefs?.on_new_connection ?? true,
    on_new_message: prefs?.on_new_message ?? true,
    on_agreement_accepted: prefs?.on_agreement_accepted ?? true,
    on_call_scheduled: prefs?.on_call_scheduled ?? true,
    on_new_match: (prefs as any)?.on_new_match ?? true,
    on_weekly_digest: (prefs as any)?.on_weekly_digest ?? true,
    match_threshold:
      typeof (prefs as any)?.match_threshold === "number"
        ? (prefs as any).match_threshold
        : 65
  };

  return (
    <AppShell>
      <h1 className="retro-h1 text-2xl">Notifications</h1>
      <p className="mt-1 retro-dim text-sm">
        Pick what reaches your phone and inbox. Phone is the primary route for
        high-signal SyncedIn moments.
      </p>

      {searchParams.saved === "1" && (
        <p className="mt-3 text-sm retro-green">✓ Saved.</p>
      )}
      {searchParams.error && (
        <p className="mt-3 text-sm retro-red">
          {searchParams.detail
            ? searchParams.detail
            : "Could not save notification settings."}
        </p>
      )}

      <NotifPrefsForm
        initial={initial}
        action={saveNotificationPrefs}
        defaultEmail={profile?.email ?? ""}
        defaultPhone={initial.phone_number}
      />
    </AppShell>
  );
}
