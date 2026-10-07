import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { phonePreferencePatch } from "@/lib/phone";
import { contentSafetyResponse } from "@/lib/content-safety";

/**
 * Auto-save the onboarding wizard draft. Fires on a debounce as the user
 * types so context is never lost on refresh / back-button.
 *
 * Saves to the same row as the final commit so the wizard can hydrate
 * itself by reading twin_profiles + profile on next visit.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    display_name?: string;
    phone_number?: string;
    avatar_url?: string;
    goals?: string;
    deal_preferences?: string;
    communication_style?: string;
    deal_breakers?: string;
    ai_export_blob?: string;
    hometown?: string;
    current_city?: string;
    achievements?: string;
  };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.values(body).some((value) => value !== undefined && typeof value !== "string")) throw new Error();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const clean = (s?: string) =>
    s && s.trim().length > 0 ? s : null;
  const safety = await contentSafetyResponse([body.display_name, body.goals, body.achievements].filter(Boolean).join("\n"), user.id);
  if (safety) return safety;

  // Profile fields (display_name, avatar_url)
  const profileUpdate: Record<string, string | null> = {};
  let phoneSaveFailed = false;
  if (body.display_name !== undefined)
    profileUpdate.display_name = clean(body.display_name);
  if (body.avatar_url !== undefined)
    profileUpdate.avatar_url = clean(body.avatar_url);
  if (body.phone_number !== undefined) {
    const phonePatch = phonePreferencePatch(body.phone_number, "onboarding_draft", false);
    if (phonePatch) {
      const { data: existing, error: readError } = await supabase.from("notification_preferences").select("phone_number").eq("user_id", user.id).maybeSingle();
      if (readError) return NextResponse.json({ error: "Your phone number could not be saved. Please try again shortly." }, { status: 503 });
      const storedPatch = existing?.phone_number === phonePatch.phone_number ? { phone_number: phonePatch.phone_number } : { ...phonePatch, on_text_notifications: false };
      const { error } = await supabase.from("notification_preferences")
        .upsert({ user_id: user.id, ...storedPatch }, { onConflict: "user_id" });
      phoneSaveFailed = !!error;
    }
  }
  if (Object.keys(profileUpdate).length > 0) {
    await supabase.from("profiles").update(profileUpdate).eq("id", user.id);
  }

  // Twin profile fields. Try the full upsert first (includes the new
  // `achievements` column added in May 2026). If the column doesn't
  // exist on this DB yet, retry without it so onboarding still saves.
  const fullFields: Record<string, any> = {
    user_id: user.id,
    goals: clean(body.goals),
    deal_preferences: clean(body.deal_preferences),
    communication_style: clean(body.communication_style),
    deal_breakers: clean(body.deal_breakers),
    ai_export_blob: clean(body.ai_export_blob),
    hometown: clean(body.hometown),
    current_city: clean(body.current_city),
    achievements: clean(body.achievements),
    updated_at: new Date().toISOString()
  };
  const { error: upErr } = await supabase
    .from("twin_profiles")
    .upsert(fullFields, { onConflict: "user_id" });
  if (upErr && /achievements|column|schema cache/i.test(upErr.message)) {
    const { achievements: _drop, ...minus } = fullFields;
    await supabase
      .from("twin_profiles")
      .upsert(minus, { onConflict: "user_id" });
  }

  if (phoneSaveFailed) return NextResponse.json({ error: "Your phone number could not be saved. Please try again shortly." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
