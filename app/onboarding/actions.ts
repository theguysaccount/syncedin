"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { slugifyHandle } from "@/lib/handle";
import { scrapePublicProfile } from "@/lib/scrape";
import { notifyNewMatch, notifyNewConnection } from "@/lib/notify";
import { pickBestFirstMatch } from "@/lib/matchmaking";
import { assignConversationSlug } from "@/lib/conversationSlugServer";
import { registerClawRoute } from "@/lib/claw-messenger";
import { normalizePhoneNumber, phonePreferencePatch } from "@/lib/phone";

function s(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

export async function saveTwin(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const display_name = s(formData.get("display_name"));
  const avatar_url = s(formData.get("avatar_url"));
  const rawPhone = String(formData.get("phone_number") ?? "").trim();
  const phone_number = normalizePhoneNumber(rawPhone);
  if (!phone_number) {
    redirect(
      `/onboarding?error=missing_phone&detail=${encodeURIComponent(
        "Add a valid phone number before saving your twin."
      )}`
    );
  }
  const fields: Record<string, any> = {
    user_id: user.id,
    goals: s(formData.get("goals")),
    deal_preferences: s(formData.get("deal_preferences")),
    communication_style: s(formData.get("communication_style")),
    deal_breakers: s(formData.get("deal_breakers")),
    ai_export_blob: s(formData.get("ai_export_blob")),
    hometown: s(formData.get("hometown")),
    current_city: s(formData.get("current_city")),
    achievements: s(formData.get("achievements")),
    updated_at: new Date().toISOString()
  };

  // Build a single profile update — only set the columns the user touched.
  const profileUpdate: Record<string, string | null> = {};
  if (display_name !== null) profileUpdate.display_name = display_name;
  if (avatar_url !== null) profileUpdate.avatar_url = avatar_url;
  const { error: phoneError } = await supabase.from("notification_preferences")
    .upsert({ user_id: user.id, ...phonePreferencePatch(rawPhone, "onboarding") }, { onConflict: "user_id" });
  if (phoneError) redirect(`/onboarding?error=phone_save&detail=${encodeURIComponent("Your phone number could not be saved. Please try again shortly.")}`);

  // Auto-generate the portfolio handle (URL slug for /u/<handle>) if the
  // user doesn't have one yet. Best-effort uniqueness — fall back to a
  // random suffix on collision so we never block the onboarding save on
  // this. The user can change it later from the portfolio edit panel.
  try {
    const { data: existing } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .maybeSingle();
    if (!(existing as any)?.handle && display_name) {
      let candidate = slugifyHandle(display_name);
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: collide } = await supabase
          .from("profiles")
          .select("id")
          .ilike("handle", candidate)
          .maybeSingle();
        if (!collide) break;
        candidate = `${slugifyHandle(display_name)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
      }
      profileUpdate.handle = candidate;
    }
  } catch {
    /* handle column may not yet exist in prod — skip silently */
  }

  if (Object.keys(profileUpdate).length > 0) {
    await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);
  }
  const route = await registerClawRoute(phone_number);
  if (!route.ok && !route.skipped) console.warn("[onboarding] claw route registration failed", route.error);

  // Try the full upsert (includes the new `achievements` column).
  // Fall back to the legacy field set if the column isn't migrated on
  // this DB yet — onboarding must always succeed end-to-end.
  const { error: upErr } = await supabase
    .from("twin_profiles")
    .upsert(fields, { onConflict: "user_id" });
  if (upErr && /achievements|column|schema cache/i.test(upErr.message)) {
    const { achievements: _drop, ...legacy } = fields;
    await supabase
      .from("twin_profiles")
      .upsert(legacy, { onConflict: "user_id" });
  }

  // Portfolio-from-LinkedIn auto-pull. If the user's blob contains a
  // LinkedIn URL and they don't yet have portfolio_about set, scrape the
  // profile and pre-fill it. Best-effort — never blocks the save. Lives
  // here so the user's /u/<handle> portfolio page renders MEANINGFULLY
  // the first time they visit it.
  // Background — the LinkedIn scrape can take several seconds. It was
  // AWAITED here, which blocked the "save twin → start connecting" redirect
  // (Jack: "the load speed is pretty slow"). Run it fire-and-forget so the
  // redirect is instant; the /u/<handle> portfolio fills in whenever the
  // scrape lands.
  void (async () => {
    try {
      const service = createServiceClient();
      const { data: profRow } = await service
        .from("profiles")
        .select("portfolio_about")
        .eq("id", user.id)
        .maybeSingle();
      const alreadyHasAbout =
        ((profRow as any)?.portfolio_about ?? "").toString().trim().length > 40;
      if (!alreadyHasAbout) {
        const blob = (fields.ai_export_blob ?? "").toString();
        const linkedInMatch = blob.match(
          /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-z0-9-]+\/?/i
        );
        if (linkedInMatch) {
          const scraped = await scrapePublicProfile(linkedInMatch[0]);
          if (scraped && scraped.trim().length > 80) {
            const aboutSeed = scraped.trim().slice(0, 700);
            await service
              .from("profiles")
              .update({ portfolio_about: aboutSeed })
              .eq("id", user.id);
          }
        }
      }
    } catch (e) {
      console.warn("[onboarding] portfolio pre-fill scrape failed", e);
    }
  })();

  // Fire-and-forget: ping every existing user whose match_threshold is
  // crossed by this newly-onboarded user. Wrapped in void + try/catch so
  // a notification fan-out failure never blocks the redirect to dashboard.
  void (async () => {
    try {
      await notifyNewMatch({ newUserId: user.id });
    } catch (e) {
      console.warn("[onboarding] notifyNewMatch failed", e);
    }
  })();

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");

  // #185 — North-star UX shift. Instead of landing the user on an empty
  // dashboard ("your twin is ready, now go find someone"), pick the
  // best real-user counterpart for them right now, create the conversation,
  // kick off the twin-to-twin auto-loop, and redirect DIRECTLY into the
  // live thread. Their first real proposal lands in minutes, not days.
  //
  // Skip entirely if the user is coming in via /claim/<slug> (they
  // already have a conversation waiting) — detected by checking for an
  // existing conv at this point. Otherwise pick the best match.
  try {
    const service = createServiceClient();
    const { data: existingConvs } = await service
      .from("conversations")
      .select("id")
      .or(
        `participant_a.eq.${user.id},participant_b.eq.${user.id}`
      )
      .limit(1);
    const hasConv = ((existingConvs as any[]) ?? []).length > 0;

    if (!hasConv) {
      const match = await pickBestFirstMatch(user.id);
      if (match) {
        const { data: conv, error: convErr } = await service
          .from("conversations")
          .insert({
            participant_a: user.id,
            participant_b: match.counterpartId
          })
          .select("id")
          .single();
        if (!convErr && conv) {
          const convId = (conv as any).id as string;
          // Fire-and-forget: assign short slug, notify both sides, AND
          // kick off the twin-to-twin auto-loop so when the user lands
          // the conversation is already in motion.
          assignConversationSlug(convId).catch(() => {});
          notifyNewConnection({
            conversationId: convId,
            participantA: user.id,
            participantB: match.counterpartId
          }).catch(() => {});
          void (async () => {
            try {
              const baseUrl = (
                process.env.NEXT_PUBLIC_APP_URL || "https://syncedin.org"
              ).replace(/\/$/, "");
              // Best-effort: start the loop on the server. If the call
              // fails (e.g. timeout), the user can still re-trigger from
              // the conversation page — ChatUI auto-starts on mount.
              await fetch(`${baseUrl}/api/run-conversation`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ conversation_id: convId })
              });
            } catch (e) {
              console.warn("[onboarding] first-match auto-start failed", e);
            }
          })();
          // Land in the twin chat (home base) where the twin greets the
          // user, explains what they can do, and surfaces this match —
          // a warmer onboarding than dropping cold into the thread. The
          // conversation above is already created + in motion in the
          // background. Jack: "have their twin greet them."
          redirect(`/twin?welcome=1`);
        }
      }
    }
  } catch (e: any) {
    // `redirect()` throws an internal Next.js error — let it propagate.
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    console.warn("[onboarding] first-match auto-create failed", e);
  }

  // Fallback redirect — used when there's no good first-match candidate
  // (very early platform), when the user already has a conversation, or
  // when the match flow errored. ?saved=1 lets the dashboard scroll to
  // top + show a confirmation.
  redirect("/twin?welcome=1");
}
