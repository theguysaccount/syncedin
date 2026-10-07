"use server";

import { redirect } from "next/navigation";
import { connectionBlocked } from "@/lib/user-safety";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyNewConnection } from "@/lib/notify";
import { assignConversationSlug } from "@/lib/conversationSlugServer";

/**
 * Dead-weight guard. Counts proposals the user has NOT acted on
 * (conversations with a summary set, no agreement_response from
 * this user). Jack: "if you have ten people waiting on you that
 * you haven't replied to the proposal, you can't connect with any
 * more people... we need to minimize dead weight in the network."
 *
 * Returns the count of "owed-by-me" proposals. Callers can short-
 * circuit at >= 10 to surface a friendly message instead of
 * silently piling up more.
 */
async function countOwedProposals(userId: string): Promise<number> {
  const service = createServiceClient();
  try {
    const { data: convs } = await service
      .from("conversations")
      .select("id, participant_a, participant_b, summary")
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .not("summary", "is", null);
    const ids = ((convs ?? []) as any[]).map((c) => c.id);
    if (ids.length === 0) return 0;
    const { data: resps } = await service
      .from("agreement_responses")
      .select("conversation_id")
      .eq("user_id", userId)
      .in("conversation_id", ids);
    const responded = new Set(
      ((resps ?? []) as any[]).map((r) => r.conversation_id)
    );
    return ids.filter((id: string) => !responded.has(id)).length;
  } catch {
    return 0;
  }
}

const PENDING_LIMIT = 10;

async function openConversationBetween(userId: string, otherId: string) {
  if (await connectionBlocked(userId, otherId)) redirect("/messages?blocked=account");
  const supabase = createClient();
  // If a conversation between these two already exists, jump to it
  // — guard doesn't apply, we're not creating new dead weight, just
  // returning to existing work.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(participant_a.eq.${userId},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${userId})`
    )
    .maybeSingle();
  if (existing) return existing.id as string;

  // BEFORE creating a brand-new conversation, enforce the dead-weight
  // guard. If the user has ≥10 proposals waiting on them, block new
  // creation and surface a friendly redirect to the merged messages inbox.
  const owed = await countOwedProposals(userId);
  if (owed >= PENDING_LIMIT) {
    return { blocked: "pending_limit" as const, owed };
  }

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ participant_a: userId, participant_b: otherId })
    .select("id")
    .single();
  if (error || !conv) {
    console.error("conversation insert failed", error);
    return null;
  }
  // #69 — assign a short_slug for /c/<slug> resolution.
  assignConversationSlug(conv.id as string).catch(() => {});
  // Fire-and-forget notify both sides of the new connection.
  notifyNewConnection({
    conversationId: conv.id as string,
    participantA: userId,
    participantB: otherId
  }).catch((e) => console.warn("[new-conv] notify failed", e));
  return conv.id as string;
}

/**
 * Start a conversation by email (kept for backwards compatibility — the new
 * UI uses startConversationByUserId).
 */
export async function startConversation(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/conversations/new?error=email");

  const service = createServiceClient();
  const { data: other } = await service
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!other) redirect("/conversations/new?error=not_found");
  if (other.id === user.id) redirect("/conversations/new?error=self");

  const result = await openConversationBetween(user.id, other.id);
  if (!result) redirect("/conversations/new?error=create");
  if (typeof result === "object" && "blocked" in result) {
    redirect(`/messages?blocked=pending&owed=${result.owed}`);
  }
  redirect(`/conversations/${result}`);
}

/**
 * Start a conversation by user_id — used by the name-search + Exa picker UI.
 */
export async function startConversationByUserId(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const otherId = String(formData.get("user_id") ?? "").trim();
  if (!otherId) redirect("/conversations/new?error=not_found");
  if (otherId === user.id) redirect("/conversations/new?error=self");

  const result = await openConversationBetween(user.id, otherId);
  if (!result) redirect("/conversations/new?error=create");
  if (typeof result === "object" && "blocked" in result) {
    redirect(`/messages?blocked=pending&owed=${result.owed}`);
  }
  redirect(`/conversations/${result}`);
}
