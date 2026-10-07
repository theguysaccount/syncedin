"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registerClawRoute } from "@/lib/claw-messenger";
import { normalizePhoneNumber, phonePreferencePatch } from "@/lib/phone";
import { authDestination, loginReturnUrl } from "@/lib/auth-return";

function origin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

/**
 * If the login form carries an `invite` (per-person slug) or `conference`
 * (community slug), thread it through the callback's `next` param so the
 * post-auth redirect lands on `/claim/<slug>` (atomic conversation seed)
 * or `/conferences/<slug>/join` (membership upsert) instead of dashboard.
 */
function nextFromForm(formData: FormData): string {
  return authDestination(formContext(formData));
}

function formContext(formData: FormData) {
  return { invite: String(formData.get("invite") ?? ""), conference: String(formData.get("conference") ?? "") };
}

function returnToLogin(formData: FormData, status: Record<string, string>): never {
  redirect(loginReturnUrl(formContext(formData), status));
}

function callbackUrl(formData: FormData): string {
  const next = nextFromForm(formData);
  return `${origin()}/auth/callback?next=${encodeURIComponent(next)}`;
}

function requireTerms(formData: FormData) {
  if (formData.get("accepted_terms") !== "yes") {
    returnToLogin(formData, { error: "terms_required", detail: "Please agree to the Terms of Service before continuing." });
  }
}

function phoneFromForm(formData: FormData, required = false): string | null {
  const raw = String(formData.get("phone_number") ?? "").trim();
  if (!raw) {
    if (required) {
      returnToLogin(formData, { error: "missing_phone", detail: "Phone number is required for new accounts." });
    }
    return null;
  }
  const phone = normalizePhoneNumber(raw);
  if (!phone) {
    returnToLogin(formData, { error: "invalid_phone", detail: "Enter a valid phone number with area code." });
  }
  return phone;
}

async function persistPhoneForUser(
  userId: string | undefined,
  phone: string | null,
  source: string,
  messagingOptIn = false
) {
  if (!userId || !phone) return;
  try {
    const service = createServiceClient();
    const { error } = await service.from("notification_preferences")
      .upsert({ user_id: userId, ...phonePreferencePatch(phone, source, messagingOptIn), on_text_notifications: messagingOptIn }, { onConflict: "user_id" });
    if (error) {
      console.warn("[login] private phone save failed", error);
      return;
    }
    if (!messagingOptIn) return;
    const route = await registerClawRoute(phone);
    if (!route.ok && !route.skipped) {
      console.warn("[login] claw route registration failed", route.error);
    }
  } catch (e) {
    console.warn("[login] phone profile update failed", e);
  }
}

// ── Magic link ────────────────────────────────────────────────────────────
export async function login(formData: FormData) {
  requireTerms(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) returnToLogin(formData, { error: "missing_email" });
  const phone = phoneFromForm(formData);

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl(formData),
      data: phone ? { phone_number: phone } : undefined
    }
  });

  if (error) {
    console.error("signInWithOtp error", error);
    returnToLogin(formData, { error: "send_failed", detail: `${error.message}${error.status ? ` (status ${error.status})` : ""}` });
  }
  returnToLogin(formData, { sent: "1" });
}

// ── Password sign-in ──────────────────────────────────────────────────────
export async function signInWithPassword(formData: FormData) {
  requireTerms(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) returnToLogin(formData, { error: "missing_credentials" });
  const phone = phoneFromForm(formData);

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) {
    returnToLogin(formData, { error: "password_failed", detail: error.message });
  }
  await persistPhoneForUser(data.user?.id, phone, "password_signin");
  redirect(nextFromForm(formData));
}

// ── Password sign-up ──────────────────────────────────────────────────────
// If Supabase has "Confirm email" on, the user still gets a confirmation
// email. Once confirmed (or if confirmation is off) they can password-login
// forever after — the redundancy that doesn't depend on magic links working.
export async function signUpWithPassword(formData: FormData) {
  requireTerms(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) returnToLogin(formData, { error: "missing_credentials" });
  const phone = phoneFromForm(formData, formData.get("native_app") !== "yes");
  if (password.length < 8) {
    returnToLogin(formData, { error: "password_failed", detail: "Password must be at least 8 characters." });
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl(formData),
      data: { phone_number: phone, messaging_opt_in: formData.get("messaging_opt_in") === "yes", terms_version: "2026-10-06", terms_accepted_at: new Date().toISOString() }
    }
  });

  // ── Existing-account recovery (task #328) ─────────────────────────────────
  // A returning user who tries "Create account" with an email that already
  // exists used to get trapped. Supabase signals the collision two different
  // ways depending on the "Confirm email" setting:
  //   1. Confirm-email OFF → signUp returns an error whose message contains
  //      "already registered". Old code dumped that raw string as a dead-end.
  //   2. Confirm-email ON (enumeration protection) → signUp returns NO error
  //      and NO session, with an obfuscated user whose `identities` array is
  //      empty. Old code said "check your inbox" for a mail that never came.
  // In BOTH cases, recover the user instead of stranding them: fire a magic
  // sign-in link to the existing address and route to a clear, actionable
  // state. (signInWithOtp delivers to existing users without leaking
  // existence, so this is safe under enumeration protection too.)
  const existsByError =
    !!error && /already (been )?registered|already exists/i.test(error.message);
  const existsBySilence =
    !error &&
    !data.session &&
    !!data.user &&
    (data.user.identities?.length ?? 0) === 0;

  if (existsByError || existsBySilence) {
    const { error: recoveryError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl(formData),
        data: phone ? { phone_number: phone } : undefined
      }
    });
    if (recoveryError) returnToLogin(formData, { error: "send_failed", detail: "We couldn't send the sign-in link. Try again or use your password." });
    returnToLogin(formData, { exists: "1" });
  }

  if (error) {
    returnToLogin(formData, { error: "password_failed", detail: error.message });
  }
  if (data.session) await persistPhoneForUser(data.user?.id, phone, "signup", formData.get("messaging_opt_in") === "yes");
  // If a session came back immediately, email confirmation is off — go in.
  if (data.session) redirect(nextFromForm(formData));
  // Otherwise they need to confirm via email first.
  returnToLogin(formData, { sent: "1" });
}

// ── OAuth (Google / Apple) ────────────────────────────────────────────────
// These require the provider to be enabled in Supabase → Auth → Providers
// with OAuth credentials. The code is ready; the provider config is not.
export async function signInWithGoogle(formData: FormData) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(formData) }
  });
  if (error || !data.url) {
    returnToLogin(formData, { error: "oauth_failed", detail: error?.message ?? "Google sign-in is not configured yet." });
  }
  redirect(data.url);
}

export async function signInWithApple(formData: FormData) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: callbackUrl(formData) }
  });
  if (error || !data.url) {
    returnToLogin(formData, { error: "oauth_failed", detail: error?.message ?? "Apple sign-in is not configured yet." });
  }
  redirect(data.url);
}

// ── Sign out ──────────────────────────────────────────────────────────────
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/");
}
