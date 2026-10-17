"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { clawMessengerConfigured, registerClawRoute, sendClawMessage } from "@/lib/claw-messenger";
import { normalizePhoneNumber, phonePreferencePatch } from "@/lib/phone";

export async function saveNotificationPrefs(formData: FormData) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = String(formData.get("email_address") ?? "").trim() || null;
  const rawPhone = String(formData.get("phone_number") ?? "").trim();
  const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
  const textEnabled = formData.get("on_text_notifications") === "on";
  if (rawPhone && !phone) {
    redirect(
      `/settings/notifications?error=invalid_phone&detail=${encodeURIComponent(
        "Enter a valid phone number with area code."
      )}`
    );
  }
  if (textEnabled && !phone) redirect("/settings/notifications?error=phone_required&detail=Add%20a%20phone%20number%20before%20enabling%20text%20alerts.");
  const preferred_messaging_service = [
    "iMessage",
    "RCS",
    "SMS"
  ].includes(String(formData.get("preferred_messaging_service") ?? ""))
    ? String(formData.get("preferred_messaging_service"))
    : "iMessage";
  const thresholdRaw = parseInt(
    String(formData.get("match_threshold") ?? "65"),
    10
  );
  const match_threshold = Number.isFinite(thresholdRaw)
    ? Math.max(30, Math.min(95, thresholdRaw))
    : 65;
  const row = {
    user_id: user.id,
    email_address: email,
    ...phonePreferencePatch(rawPhone, "notification_settings", textEnabled),
    on_text_notifications: !!phone && textEnabled,
    preferred_messaging_service,
    on_new_connection: formData.get("on_new_connection") === "on",
    on_new_message: formData.get("on_new_message") === "on",
    on_agreement_accepted: formData.get("on_agreement_accepted") === "on",
    on_call_scheduled: formData.get("on_call_scheduled") === "on",
    on_new_match: formData.get("on_new_match") === "on",
    on_weekly_digest: formData.get("on_weekly_digest") === "on",
    match_threshold,
    updated_at: new Date().toISOString()
  };

  const service = createServiceClient();
  const { error } = await service
    .from("notification_preferences")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("[notif prefs] upsert failed", error);
    redirect("/settings/notifications?error=save");
  }
  if (phone && textEnabled) {
    const route = await registerClawRoute(phone);
    if (!route.ok) {
      console.warn("[notif prefs] claw route registration failed", route.error);
      redirect("/settings/notifications?error=text_setup&detail=Settings%20saved%2C%20but%20text%20setup%20could%20not%20complete.%20Please%20try%20again.");
    }
  }

  revalidatePath("/settings/notifications");
  redirect("/settings/notifications?saved=1");
}

export async function sendTestText() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceClient();
  const { data: prefs } = await service.from("notification_preferences")
    .select("phone_number, on_text_notifications, phone_consent_at, preferred_messaging_service")
    .eq("user_id", user.id).maybeSingle();
  if (!prefs?.phone_number || !prefs.on_text_notifications || !prefs.phone_consent_at) {
    redirect("/settings/notifications?error=consent&detail=Save%20your%20phone%20number%20and%20enable%20text%20alerts%20first.");
  }
  if (!clawMessengerConfigured()) redirect("/settings/notifications?error=text_unavailable&detail=Text%20messaging%20is%20temporarily%20unavailable.");
  // A unique reservation limits tests across concurrent serverless requests.
  const dedupeKey = `text-test:${Math.floor(Date.now() / 600_000)}`;
  const { error } = await service.from("notification_log").insert({
    user_id: user.id, kind: "text_test", dedupe_key: dedupeKey,
    phone_number: prefs.phone_number, sent_channels: []
  });
  if (error) redirect("/settings/notifications?error=test_wait&detail=Please%20wait%20before%20sending%20another%20test.");
  const result = await sendClawMessage({
    to: prefs.phone_number, service: prefs.preferred_messaging_service,
    text: "SyncedIn delivery test. Your phone alerts are connected. Open https://syncedin.org/settings/notifications to manage alerts."
  });
  if (!result.ok || result.skipped) redirect("/settings/notifications?error=text_failed&detail=The%20messaging%20provider%20did%20not%20accept%20the%20test.%20Please%20try%20again%20later.");
  await service.from("notification_log").update({ sent_channels: ["phone"] })
    .eq("user_id", user.id).eq("dedupe_key", dedupeKey);
  redirect("/settings/notifications?test=accepted");
}
