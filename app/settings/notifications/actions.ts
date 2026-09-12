"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registerClawRoute } from "@/lib/claw-messenger";
import { normalizePhoneNumber, phonePreferencePatch } from "@/lib/phone";

export async function saveNotificationPrefs(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = String(formData.get("email_address") ?? "").trim() || null;
  const rawPhone = String(formData.get("phone_number") ?? "").trim();
  const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
  if (rawPhone && !phone) {
    redirect(
      `/settings/notifications?error=invalid_phone&detail=${encodeURIComponent(
        "Enter a valid phone number with area code."
      )}`
    );
  }
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
    ...phonePreferencePatch(rawPhone, "notification_settings"),
    on_text_notifications: formData.get("on_text_notifications") === "on",
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
  if (phone) {
    const route = await registerClawRoute(phone);
    if (!route.ok && !route.skipped) {
      console.warn("[notif prefs] claw route registration failed", route.error);
    }
  }

  revalidatePath("/settings/notifications");
  redirect("/settings/notifications?saved=1");
}
