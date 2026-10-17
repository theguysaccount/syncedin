import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/twin/execute-action
 *
 * Called when the user taps Approve on an inline ActionCard in the
 * twin chat. The twin chat NEVER mutates the DB itself — the model
 * only stages actions; this endpoint is the only place writes happen.
 *
 * Body: { type, payload }
 *
 * Validates that the authenticated user actually participates in the
 * conversation referenced by payload, then dispatches to the right
 * underlying mutation (mirrors the same writes that /api/respond-
 * agreement, /api/conversations/[id]/change-proposal, and /api/send-
 * message already do — same shape, same RLS-equivalent ownership
 * check, just driven by the twin instead of UI buttons).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  type:
    | "update_proposal_text"
    | "accept_proposal"
    | "deny_proposal"
    | "send_message_to_conversation"
    | "update_twin_context"
    | "create_invite"
    | "submit_feedback"
    | "start_conversation";
  payload: Record<string, any>;
};

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { type, payload } = body;
  if (!type || !payload) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const service = createServiceClient();

  // ── UPDATE TWIN CONTEXT (no conversation needed) ─────────────────
  // Appends new context/goal to the user's OWN twin so it informs future
  // conversations. Handled before the conversation-ownership check since
  // it isn't tied to a conversation. Jack: "the chat should be able to do
  // everything" — this is the twin updating its own memory on request.
  if (type === "update_twin_context") {
    const text = String(payload.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "missing_text" }, { status: 400 });
    }
    const { data: tp } = await service
      .from("twin_profiles")
      .select("ai_export_blob")
      .eq("user_id", user.id)
      .maybeSingle();
    const prev = ((tp as any)?.ai_export_blob || "").toString();
    const stamp = new Date().toISOString().slice(0, 10);
    const next = `${prev ? prev + "\n\n" : ""}[Added via twin chat ${stamp}]: ${text}`;
    const { error } = await service
      .from("twin_profiles")
      .upsert({ user_id: user.id, ai_export_blob: next }, { onConflict: "user_id" });
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, action: "context_updated" });
  }

  // ── SUBMIT FEEDBACK (no conversation needed) ─────────────────────
  if (type === "submit_feedback") {
    const message = String(payload.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "missing_message" }, { status: 400 });
    }
    const { error } = await service.from("feedback").insert({
      user_id: user.id,
      message,
      surface: "twin_chat"
    });
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, action: "feedback_submitted" });
  }

  // ── CREATE INVITE (no conversation needed) ───────────────────────
  // Generates a real /<slug> invite from a name + target (URL/email/phone/
  // handle). Lightweight version of the bulk-reach flow: no scrape, but a
  // working personalized landing link the twin can hand back in chat.
  if (type === "create_invite") {
    const name = String(payload.name || "").trim();
    const target = String(payload.target || "").trim();
    if (!name && !target) {
      return NextResponse.json({ error: "missing_invitee" }, { status: 400 });
    }
    const base =
      (name || target)
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "friend";
    let slug = base;
    for (let i = 0; i < 6; i++) {
      const { data: ex } = await service
        .from("pending_invites")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!ex) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const isEmail = /\S+@\S+\.\S+/.test(target);
    const isUrl = /^https?:\/\//.test(target) || /(linkedin|x|twitter|instagram|facebook)\.com/.test(target);
    const isPhone = /^\+?[0-9][0-9\s().-]{6,}$/.test(target);
    const { data: meProf } = await service
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const selfFirst =
      (((meProf as any)?.display_name as string) || (user.email ?? "") || "")
        .split(/\s+/)[0] || "I";
    const firstName = (name || "there").split(/\s+/)[0];
    const starter = `${firstName}, ${selfFirst} here. I'm on SyncedIn, where our digital twins talk first to surface the win-win before either of us spends time on a call. Spin yours up in two minutes and see what mine already drafted for you.`;
    const fullRow: Record<string, unknown> = {
      slug,
      inviter_user_id: user.id,
      person_title: name || target,
      person_url: isUrl ? target : null,
      conversation_starter: starter,
      recipient_email: isEmail ? target.toLowerCase() : null,
      recipient_phone: isPhone ? target : null,
      recipient_handle:
        !isEmail && !isUrl && !isPhone ? target.toLowerCase().replace(/^@/, "") : null
    };
    let insErr = (await service.from("pending_invites").insert(fullRow)).error;
    if (insErr && /column .* does not exist/i.test(insErr.message)) {
      insErr = (
        await service.from("pending_invites").insert({
          slug,
          inviter_user_id: user.id,
          person_title: name || target,
          conversation_starter: starter
        })
      ).error;
    }
    if (insErr) {
      return NextResponse.json(
        { error: "save_failed", detail: insErr.message },
        { status: 500 }
      );
    }
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://syncedin.org";
    return NextResponse.json({
      ok: true,
      action: "invite_created",
      url: `${origin}/${slug}`
    });
  }

  // ── START CONVERSATION (creates a conversation, no id needed) ────
  // Lets the user connect with someone found via search_platform_users
  // entirely from chat. Reuses an existing conversation if one already
  // exists between the pair, otherwise inserts a new one.
  if (type === "start_conversation") {
    const targetId = String(payload.target_user_id || "").trim();
    if (!targetId) {
      return NextResponse.json({ error: "missing_target" }, { status: 400 });
    }
    if (targetId === user.id) {
      return NextResponse.json({ error: "cannot_self" }, { status: 400 });
    }
    const { data: target } = await service
      .from("profiles")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "https://syncedin.org";
    // Reuse an existing conversation between the pair if there is one.
    const { data: existing } = await service
      .from("conversations")
      .select("id")
      .or(
        `and(participant_a.eq.${user.id},participant_b.eq.${targetId}),and(participant_a.eq.${targetId},participant_b.eq.${user.id})`
      )
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: true,
        action: "conversation_exists",
        url: `${origin}/conversations/${(existing as any).id}`
      });
    }
    const { data: created, error: convErr } = await service
      .from("conversations")
      .insert({ participant_a: user.id, participant_b: targetId })
      .select("id")
      .single();
    if (convErr || !created) {
      return NextResponse.json(
        { error: "save_failed", detail: convErr?.message ?? "insert_failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      action: "conversation_started",
      url: `${origin}/conversations/${(created as any).id}`
    });
  }

  // All conversation write actions below need ownership of a
  // conversation_id, so do that check once up front.
  const conversation_id = String(payload.conversation_id || "").trim();
  if (!conversation_id) {
    return NextResponse.json(
      { error: "missing_conversation_id" },
      { status: 400 }
    );
  }
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", conversation_id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json(
      { error: "conversation_not_found" },
      { status: 404 }
    );
  }
  if (
    (conv as any).participant_a !== user.id &&
    (conv as any).participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── ACCEPT / DENY (writes agreement_responses) ───────────────────
  if (type === "accept_proposal" || type === "deny_proposal") {
    if (type === "accept_proposal") {
      const { error } = await service
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
      if (error) {
        return NextResponse.json(
          { error: "save_failed", detail: error.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, action: "accepted" });
    }

    const reason = String(payload.reason || "").trim() || null;
    // Mirror the rejection pattern from /api/respond-agreement: reset
    // both sides' responses so the twins can renegotiate cleanly.
    await service
      .from("agreement_responses")
      .delete()
      .eq("conversation_id", conversation_id);
    const { error } = await service
      .from("agreement_responses")
      .insert({
        conversation_id,
        user_id: user.id,
        response: "rejected",
        reason
      });
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  // ── UPDATE PROPOSAL TEXT (rewrites conversation.summary + clears
  //    stale agreement_responses so both sides see the new proposal) ──
  if (type === "update_proposal_text") {
    const new_text = String(payload.new_text || "").trim();
    if (!new_text) {
      return NextResponse.json(
        { error: "missing_new_text" },
        { status: 400 }
      );
    }
    // Update the conversation summary itself — this is what the
    // conversation page + proposals page both read. (updated_at
    // column doesn't exist on this schema, so only set summary.)
    const { error: upErr } = await service
      .from("conversations")
      .update({ summary: new_text })
      .eq("id", conversation_id);
    if (upErr) {
      return NextResponse.json(
        { error: "save_failed", detail: upErr.message },
        { status: 500 }
      );
    }
    // Clear stale agreement_responses — the proposal changed so
    // existing accept/deny clicks no longer apply.
    await service
      .from("agreement_responses")
      .delete()
      .eq("conversation_id", conversation_id);
    // If the user asked to update AND accept in one breath, record their
    // acceptance now (after the clear above, so it isn't wiped). This is
    // why "update the proposal and I accept it" no longer needs a second
    // Approve card. Jack: "it should have auto-accepted because I
    // accepted it."
    if (payload.also_accept === true) {
      const { error: accErr } = await service
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
      if (accErr) {
        return NextResponse.json(
          { error: "save_failed", detail: accErr.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, action: "updated_and_accepted" });
    }
    return NextResponse.json({ ok: true, action: "updated" });
  }

  // ── SEND MESSAGE INTO CONVERSATION ──────────────────────────────
  if (type === "send_message_to_conversation") {
    const text = String(payload.text || "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "missing_text" },
        { status: 400 }
      );
    }
    const { error } = await service.from("messages").insert({
      conversation_id,
      sender_user_id: user.id,
      original_draft: text,
      final_text: text,
      edited: false,
      sent_at: new Date().toISOString()
    });
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, action: "sent" });
  }

  return NextResponse.json(
    { error: `unknown action type: ${type}` },
    { status: 400 }
  );
}
