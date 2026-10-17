import { after, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyAcceptanceNudge, notifyAgreementSealed } from "@/lib/notify";

/**
 * Record a participant's response to a proposed final destination.
 *
 *  accepted → upsert the response. If BOTH participants have accepted, the
 *             deal is sealed.
 *  rejected → clear all responses, delete the agreement message, and insert
 *             the rejection reason as a real message from the rejecting user
 *             so the twins regenerate from there with the objection in context.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    conversation_id?: string;
    response?: "accepted" | "rejected";
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { conversation_id, response, reason } = body;
  if (
    !conversation_id ||
    (response !== "accepted" && response !== "rejected")
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (response === "rejected" && (!reason || !reason.trim())) {
    return NextResponse.json(
      { error: "reason_required", detail: "A reason is required to reject." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("*")
    .eq("id", conversation_id)
    .single();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (response === "accepted") {
    const { error: upErr } = await service
      .from("agreement_responses")
      .upsert(
        {
          conversation_id,
          user_id: user.id,
          response: "accepted",
          reason: null
        },
        { onConflict: "conversation_id,user_id" }
      );
    if (upErr) {
      return NextResponse.json(
        { error: "save_failed", detail: upErr.message },
        { status: 500 }
      );
    }
    // Both accepted?
    const { data: all } = await service
      .from("agreement_responses")
      .select("user_id, response")
      .eq("conversation_id", conversation_id);
    const accepted = new Set(
      (all ?? [])
        .filter((r) => r.response === "accepted")
        .map((r) => r.user_id)
    );
    const bothAccepted =
      accepted.has(conv.participant_a) && accepted.has(conv.participant_b);
    if (bothAccepted) {
      after(() => notifyAgreementSealed({ conversationId: conversation_id }).catch((e) =>
        console.warn("[respond-agreement] notify failed", e)
      ));
    } else {
      // One-sided accept: the deal can ONLY seal if the counterpart
      // knows about it. Nudge them (deduped, pref-respecting, persona-safe).
      after(() => notifyAcceptanceNudge({
        conversationId: conversation_id,
        acceptedByUserId: user.id
      }).catch((e) => console.warn("[respond-agreement] nudge failed", e)));
    }
    return NextResponse.json({ ok: true, both_accepted: bothAccepted });
  }

  // rejected: reset responses, drop the agreement message, inject the reason
  await service
    .from("agreement_responses")
    .delete()
    .eq("conversation_id", conversation_id);

  // The agreement lives in the last message — remove it so the twins re-draft.
  const { data: lastMsg } = await service
    .from("messages")
    .select("id, sent_at")
    .eq("conversation_id", conversation_id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMsg) {
    await service.from("messages").delete().eq("id", lastMsg.id);
  }

  // Insert the rejection reason as a message from the rejecting user, so the
  // twins continue the negotiation with the objection in full context.
  const rejectionText = `I can't agree to that as proposed. ${reason!.trim()}`;
  const { error: insErr } = await service.from("messages").insert({
    conversation_id,
    sender_user_id: user.id,
    original_draft: rejectionText,
    final_text: rejectionText,
    edited: false
  });
  if (insErr) {
    return NextResponse.json(
      { error: "insert_failed", detail: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, regenerate: true });
}
