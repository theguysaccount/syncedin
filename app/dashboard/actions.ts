"use server";

import { redirect } from "next/navigation";
import { connectionBlocked } from "@/lib/user-safety";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyNewConnection } from "@/lib/notify";
import { assignConversationSlug } from "@/lib/conversationSlugServer";

/**
 * Manually set the excitement score on a conversation. Locking it means the
 * user's judgment overrides the AI score and is kept as a calibration signal.
 */
export async function setExcitement(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const raw = Number(formData.get("score"));
  if (!conversationId || Number.isNaN(raw)) {
    redirect("/dashboard?error=bad_excitement");
  }
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("participant_a, participant_b")
    .eq("id", conversationId)
    .maybeSingle();
  if (
    !conv ||
    (conv.participant_a !== user.id && conv.participant_b !== user.id)
  ) {
    redirect("/dashboard?error=forbidden");
  }

  await service
    .from("conversations")
    .update({ excitement_score: score, excitement_locked: true })
    .eq("id", conversationId);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Start (or open) a conversation between the current user and a test persona.
 * Test personas are seeded users with is_test_persona = true.
 */
export async function startTestConversation(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const personaId = String(formData.get("personaId") ?? "").trim();
  if (!personaId) redirect("/dashboard?error=missing_persona");

  const service = createServiceClient();
  const { data: persona } = await service
    .from("profiles")
    .select("id, is_test_persona")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona?.is_test_persona) {
    redirect("/dashboard?error=invalid_persona");
  }

  // Reuse existing conversation if one already exists.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(participant_a.eq.${user.id},participant_b.eq.${personaId}),and(participant_a.eq.${personaId},participant_b.eq.${user.id})`
    )
    .maybeSingle();
  if (existing) redirect(`/conversations/${existing.id}`);

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ participant_a: user.id, participant_b: personaId })
    .select("id")
    .single();
  if (error || !conv) {
    console.error("test conversation insert failed", error);
    redirect("/dashboard?error=create_failed");
  }
  // #69 — fire-and-forget short-slug assignment so /c/<slug> works.
  assignConversationSlug(conv.id as string).catch(() => {});
  redirect(`/conversations/${conv.id}`);
}

/**
 * Start (or open) a conversation between the current user and another real
 * SyncedIn user, picked from the directory on the dashboard.
 */
export async function startConversationWithUser(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const otherId = String(formData.get("userId") ?? "").trim();
  if (!otherId) redirect("/dashboard?error=missing_user");
  if (otherId === user.id) redirect("/dashboard?error=self");
  if (await connectionBlocked(user.id, otherId)) redirect("/messages?blocked=account");

  const service = createServiceClient();
  const { data: other } = await service
    .from("profiles")
    .select("id")
    .eq("id", otherId)
    .maybeSingle();
  if (!other) redirect("/dashboard?error=user_not_found");

  // Reuse existing conversation if one already exists.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(participant_a.eq.${user.id},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${user.id})`
    )
    .maybeSingle();
  if (existing) redirect(`/conversations/${existing.id}`);

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ participant_a: user.id, participant_b: otherId })
    .select("id")
    .single();
  if (error || !conv) {
    console.error("conversation insert failed", error);
    redirect("/dashboard?error=create_failed");
  }
  // #69 — short-slug for /c/<slug>.
  assignConversationSlug(conv.id as string).catch(() => {});
  // Fire-and-forget notification to both participants.
  notifyNewConnection({
    conversationId: conv.id,
    participantA: user.id,
    participantB: otherId
  }).catch((e) => console.warn("[start-conv] notify failed", e));
  redirect(`/conversations/${conv.id}`);
}
