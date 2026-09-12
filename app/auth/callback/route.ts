import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerClawRoute } from "@/lib/claw-messenger";
import { normalizePhoneNumber, phonePreferencePatch } from "@/lib/phone";
import { authContextFromNext, loginReturnUrl, safeAuthNext } from "@/lib/auth-return";

// Supabase magic-link / OAuth callback.
// Handles both PKCE (?code=...) and OTP token_hash (?token_hash=...&type=...).
// Surfaces the real error to /login so failures aren't a black box.

/**
 * Resolve where to send a user after successful auth.
 *  - If `?next=...` was passed (claim flow, deep links, etc.), honor it.
 *  - Otherwise, if the user has no twin_profile yet, treat them as a
 *    brand-new signup and send them DIRECTLY to /onboarding — the welcome
 *    splash + prefilled fields are the highest-leverage first impression.
 *  - Otherwise send them to /dashboard.
 */
async function resolveLanding(
  origin: string,
  explicitNext: string | null
): Promise<string> {
  try {
    const sb = createClient();
    const {
      data: { user }
    } = await sb.auth.getUser();
    if (!user) return `${origin}${explicitNext || "/dashboard"}`;
    const metadataPhone = normalizePhoneNumber(
      (user.user_metadata as any)?.phone_number
    );
    if (metadataPhone) {
      const { data: prefs, error: readError } = await sb.from("notification_preferences")
        .select("phone_consent_source").eq("user_id", user.id).maybeSingle();
      if (!readError && !prefs?.phone_consent_source) {
        const { error } = await sb.from("notification_preferences")
          .upsert({ user_id: user.id, ...phonePreferencePatch(metadataPhone, "auth_callback") }, { onConflict: "user_id" });
        if (!error) {
          const route = await registerClawRoute(metadataPhone);
          if (!route.ok && !route.skipped) console.warn("[auth callback] claw route registration failed", route.error);
        } else console.warn("[auth callback] private phone save failed", error);
      }
    }
    if (explicitNext && explicitNext !== "/dashboard") return `${origin}${explicitNext}`;
    const { data: twin } = await sb
      .from("twin_profiles")
      .select("user_id, goals, ai_export_blob")
      .eq("user_id", user.id)
      .maybeSingle();
    // Treat the user as "needs onboarding" if there's no row OR the row
    // is essentially empty. The latter happens when /claim seeded an
    // ai_export_blob from scrape highlights — that's a half-built twin
    // that still needs the welcome splash before /dashboard.
    const finishedSetup =
      twin &&
      ((twin.goals && twin.goals.trim().length > 5) ||
        (twin.ai_export_blob && twin.ai_export_blob.trim().length > 200));
    return finishedSetup
      ? `${origin}/dashboard`
      : `${origin}/onboarding?welcome=1`;
  } catch {
    return `${origin}${explicitNext || "/dashboard"}`;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const explicitNext = safeAuthNext(searchParams.get("next"));

  const supabase = createClient();
  let errMsg = "";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(await resolveLanding(origin, explicitNext));
    }
    errMsg = error.message;
  } else if (token_hash) {
    // token_hash links work in ANY browser (no PKCE verifier needed).
    // The OTP `type` varies by Supabase version — try the likely ones.
    const candidates = [type, "email", "magiclink", "signup"].filter(
      Boolean
    ) as string[];
    for (const t of candidates) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: t as any
      });
      if (!error) {
        return NextResponse.redirect(
          await resolveLanding(origin, explicitNext)
        );
      }
      errMsg = error.message;
    }
  } else {
    errMsg = "The sign-in link had no auth token — it may have been mangled by your email client. Request a fresh one.";
  }

  return NextResponse.redirect(
    `${origin}${loginReturnUrl(authContextFromNext(explicitNext), { error: "callback", detail: errMsg || "unknown callback error" })}`
  );
}
