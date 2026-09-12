/**
 * Notification dispatch layer.
 *
 * Each notify* function:
 *   1. Looks up the recipient profile + their notification_preferences.
 *   2. Checks the relevant toggle. Defaults to true if the row doesn't exist.
 *   3. Generates a stable dedupe_key so we never double-send (e.g. on retries).
 *   4. Inserts notification_log row; on unique-violation, bails silently.
 *   5. Sends the email via lib/email.
 *
 * Everything is fire-and-forget from the caller's perspective. We catch all
 * errors and log — a failed notification should never block the underlying
 * action (new conversation, new message, accept agreement).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailHtml } from "@/lib/email";
import { computePairScore, type TwinSnapshot } from "@/lib/pair-score";
import { sendPushToUser } from "@/lib/push";
import { sendClawMessage } from "@/lib/claw-messenger";

// Minimal entity escape — names + emails can contain & < > " '
// which would break the HTML if interpolated directly.
function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://syncedin.org";

type Prefs = {
  user_id: string;
  email_address: string | null;
  phone_number: string | null;
  on_text_notifications: boolean;
  preferred_messaging_service: string;
  on_new_connection: boolean;
  on_new_message: boolean;
  on_agreement_accepted: boolean;
  on_call_scheduled: boolean;
  on_new_match: boolean;
  match_threshold: number;
};

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

async function loadRecipient(
  userId: string
): Promise<{ profile: ProfileRow; prefs: Prefs } | null> {
  const service = createServiceClient();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    service
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", userId)
      .maybeSingle(),
    service
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  if (!profile) return null;
  const effectivePrefs: Prefs = {
    user_id: userId,
    email_address: prefs?.email_address ?? null,
    phone_number: prefs?.phone_number ?? null,
    on_text_notifications: prefs?.on_text_notifications ?? true,
    preferred_messaging_service:
      prefs?.preferred_messaging_service ?? "iMessage",
    on_new_connection: prefs?.on_new_connection ?? true,
    on_new_message: prefs?.on_new_message ?? true,
    on_agreement_accepted: prefs?.on_agreement_accepted ?? true,
    on_call_scheduled: prefs?.on_call_scheduled ?? true,
    // New-match alert defaults: ON, threshold 65. Existing prefs rows
    // without these columns (pre-migration) get the defaults via the ??
    // so notifications keep working through the rollout window.
    on_new_match: prefs?.on_new_match ?? true,
    match_threshold:
      typeof prefs?.match_threshold === "number"
        ? Math.max(0, Math.min(100, prefs.match_threshold))
        : 65
  };
  return { profile: profile as ProfileRow, prefs: effectivePrefs };
}

function phoneRoute(recipient: { profile: ProfileRow; prefs: Prefs }) {
  return {
    phone: recipient.prefs.phone_number,
    textEnabled: recipient.prefs.on_text_notifications,
    textService: recipient.prefs.preferred_messaging_service
  };
}

async function logAndSend(args: {
  userId: string;
  kind: string;
  dedupeKey: string;
  subjectId?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
  phone?: string | null;
  textEnabled?: boolean;
  textService?: string;
  smsText?: string;
}): Promise<void> {
  const service = createServiceClient();
  const shouldText = !!args.phone && args.textEnabled !== false;
  // Reserve an attempt before sending. A reservation is not a delivery receipt.
  const entry = {
    user_id: args.userId,
    kind: args.kind,
    subject_id: args.subjectId ?? null,
    dedupe_key: args.dedupeKey,
    email_address: args.to
  };
  let { error: logErr } = await service.from("notification_log").insert({
    ...entry,
    phone_number: args.phone ?? null,
    sent_channels: []
  });
  const legacyLog = logErr?.code === "42703" || logErr?.code === "PGRST204";
  if (legacyLog) ({ error: logErr } = await service.from("notification_log").insert(entry));
  if (logErr) {
    // Duplicate (already sent) is the common case; quietly skip.
    if (!/duplicate|unique/i.test(logErr.message || "")) {
      console.warn("[notify] log insert failed", args.kind, logErr.message);
    }
    return;
  }
  const acceptedChannels: string[] = [];
  try {
    const result = await sendEmail({ to: args.to, subject: args.subject, text: args.text, html: args.html });
    if (result.ok && !result.skipped) acceptedChannels.push("email");
    if (!result.ok) console.warn("[notify] send failed", args.kind, result.error);
  } catch (error) {
    console.warn("[notify] email threw", args.kind, error);
  }
  if (shouldText) {
    const smsText = (args.smsText ?? args.text).replace(/\u2014/g, "-");
    try {
      const sms = await sendClawMessage({ to: args.phone, text: smsText, service: args.textService });
      if (sms.ok && !sms.skipped) acceptedChannels.push("phone");
      if (!sms.ok && !sms.skipped) console.warn("[notify] claw send failed", args.kind, sms.error);
    } catch (error) {
      console.warn("[notify] claw threw", args.kind, error);
    }
  }
  if (!legacyLog) {
    // This records provider acceptance only, not inbox or handset delivery.
    const { error } = await service.from("notification_log").update({ sent_channels: acceptedChannels })
      .eq("user_id", args.userId).eq("dedupe_key", args.dedupeKey);
    if (error) console.warn("[notify] channel status update failed", args.kind, error.message);
  }
}

function firstName(displayName: string | null, email: string | null): string {
  if (displayName && displayName.trim()) {
    return displayName.trim().split(/\s+/)[0];
  }
  if (email) {
    return email.split("@")[0];
  }
  return "there";
}

// ---------------------------------------------------------------------------
// New connection — when a fresh conversation is created between two users.
// Notify BOTH participants (each one independently subject to their prefs).
// ---------------------------------------------------------------------------

export async function notifyNewConnection(opts: {
  conversationId: string;
  participantA: string;
  participantB: string;
}): Promise<void> {
  try {
    await Promise.all([
      notifyOneNewConnection(
        opts.conversationId,
        opts.participantA,
        opts.participantB
      ),
      notifyOneNewConnection(
        opts.conversationId,
        opts.participantB,
        opts.participantA
      )
    ]);
  } catch (e) {
    console.warn("[notify] new-connection threw", e);
  }
}

async function notifyOneNewConnection(
  conversationId: string,
  recipientId: string,
  otherId: string
): Promise<void> {
  const recipient = await loadRecipient(recipientId);
  const other = await loadRecipient(otherId);
  if (!recipient || !other) return;
  if (!recipient.prefs.on_new_connection) return;
  const to = recipient.prefs.email_address || recipient.profile.email;
  if (!to) return;
  // Don't email test personas.
  const service = createServiceClient();
  const { data: isPersona } = await service
    .from("profiles")
    .select("is_test_persona")
    .eq("id", recipientId)
    .maybeSingle();
  if (isPersona?.is_test_persona) return;

  const otherName =
    other.profile.display_name || other.profile.email || "Someone";
  const recipFirst = firstName(
    recipient.profile.display_name,
    recipient.profile.email
  );
  const convUrl = `${APP_URL}/conversations/${conversationId}`;
  const subject = `${otherName} connected with your twin`;
  const text = `Hey ${recipFirst},\n\n${otherName} just started a conversation with your twin on SyncedIn. Your twins are negotiating now — open the thread to see what they're working out and chime in whenever you want.\n\n${convUrl}\n\n— SyncedIn`;

  // Fetch the extras the cool email template uses — both avatars and
  // both twins so we can compute a sync %. Wrapped in try so a missing
  // column on prod never breaks the email send.
  let mineAvatar: string | null = null;
  let theirsAvatar: string | null = null;
  let syncPct: number | null = null;
  let theirHeadline: string | null = null;
  let previewQuote: string | null = null;
  try {
    const [
      { data: myProf },
      { data: theirProf },
      { data: myTwin },
      { data: theirTwin }
    ] = await Promise.all([
      service
        .from("profiles")
        .select("avatar_url")
        .eq("id", recipientId)
        .maybeSingle(),
      service
        .from("profiles")
        .select("avatar_url, bio, headline")
        .eq("id", otherId)
        .maybeSingle(),
      service
        .from("twin_profiles")
        .select("goals, deal_preferences, ai_export_blob, communication_style")
        .eq("user_id", recipientId)
        .maybeSingle(),
      service
        .from("twin_profiles")
        .select("goals, deal_preferences, ai_export_blob, communication_style")
        .eq("user_id", otherId)
        .maybeSingle()
    ]);
    mineAvatar = ((myProf as any)?.avatar_url as string) ?? null;
    theirsAvatar = ((theirProf as any)?.avatar_url as string) ?? null;
    theirHeadline =
      ((theirProf as any)?.headline as string | null) ||
      ((theirProf as any)?.bio as string | null) ||
      null;
    if (myTwin && theirTwin) {
      syncPct = computePairScore(
        myTwin as TwinSnapshot,
        theirTwin as TwinSnapshot
      );
    }
    // Preview snippet: pull the LATEST message body for this convo so
    // the email shows what the twins are actually negotiating. Falls
    // back to the counterpart's goal so the email never reads cold.
    const { data: lastMsg } = await service
      .from("messages")
      .select("final_text")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw =
      ((lastMsg as any)?.final_text as string | undefined) ||
      ((theirTwin as any)?.goals as string | undefined) ||
      null;
    if (raw) {
      // Strip the AGREEMENT marker block if present + collapse to 200 chars
      const clean = raw
        .replace(/>>> AGREEMENT:[\s\S]*$/i, "")
        .replace(/!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (clean.length > 8) {
        previewQuote =
          clean.length > 200 ? clean.slice(0, 197) + "…" : clean;
      }
    }
  } catch {
    /* non-fatal — email just renders without the chrome */
  }

  // Build the body — if we have a headline + preview, surface them so
  // the recipient gets context before clicking through.
  const headlineLine = theirHeadline
    ? `<p style="margin:0 0 12px 0;color:#aab0c2;font-size:13px;">${escapeHtml(
        theirHeadline.slice(0, 140)
      )}</p>`
    : "";
  const html = renderEmailHtml({
    preheader: `${otherName} just connected with your twin.`,
    heading: `${otherName} connected with your twin`,
    kicker: "new connection",
    heroAvatars: { mine: mineAvatar, theirs: theirsAvatar },
    syncScore: syncPct,
    previewQuote,
    body: `<p style="margin:0 0 10px 0;">Hey ${escapeHtml(
      recipFirst
    )},</p>${headlineLine}<p style="margin:0;">Your twins are negotiating now. Open the thread to see what they&rsquo;re working out — you can edit any message before it sends.</p>`,
    ctaText: "Open conversation",
    ctaUrl: convUrl,
    footerNote: `You&rsquo;re getting this because new connections are on in your notification settings.`
  });
  await logAndSend({
    userId: recipientId,
    kind: "new_connection",
    dedupeKey: `new_connection:${conversationId}:${recipientId}`,
    subjectId: conversationId,
    to,
    subject,
    text,
    html,
    ...phoneRoute(recipient)
  });
}

// ---------------------------------------------------------------------------
// New message — debounced to "first new message in 10 minutes since the
// recipient last sent." We don't want a buzz for every twin-to-twin volley.
// ---------------------------------------------------------------------------

export async function notifyNewMessage(opts: {
  conversationId: string;
  messageId: string;
  senderUserId: string;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const { data: conv } = await service
      .from("conversations")
      .select("participant_a, participant_b")
      .eq("id", opts.conversationId)
      .maybeSingle();
    if (!conv) return;
    const recipientId =
      conv.participant_a === opts.senderUserId
        ? conv.participant_b
        : conv.participant_a;
    if (recipientId === opts.senderUserId) return;

    const recipient = await loadRecipient(recipientId);
    if (!recipient) return;
    if (!recipient.prefs.on_new_message) return;
    const to = recipient.prefs.email_address || recipient.profile.email;
    if (!to) return;

    // Skip test personas.
    const { data: isPersona } = await service
      .from("profiles")
      .select("is_test_persona")
      .eq("id", recipientId)
      .maybeSingle();
    if (isPersona?.is_test_persona) return;

    // Debounce: if we already sent a new_message notification for this
    // conversation in the last 30 minutes, skip.
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recentLog } = await service
      .from("notification_log")
      .select("id")
      .eq("user_id", recipientId)
      .eq("kind", "new_message")
      .eq("subject_id", opts.conversationId)
      .gte("sent_at", since)
      .limit(1)
      .maybeSingle();
    if (recentLog) return;

    // Don't double-email a brand-new connection. When someone's twin just
    // matched (new_match email) and the twins immediately start talking,
    // the first auto-message would otherwise fire a SECOND "sent something
    // new" email seconds later. If a new_match notification for THIS
    // counterpart went out in the last hour, skip the message alert — the
    // match email already pointed them at the conversation. Jack: "got a
    // double email, should only send one."
    const sinceMatch = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: recentMatch } = await service
      .from("notification_log")
      .select("id")
      .eq("user_id", recipientId)
      .eq("kind", "new_match")
      .eq("subject_id", opts.senderUserId)
      .gte("sent_at", sinceMatch)
      .limit(1)
      .maybeSingle();
    if (recentMatch) return;

    const sender = await loadRecipient(opts.senderUserId);
    const senderName =
      sender?.profile.display_name || sender?.profile.email || "Your twin";
    const convUrl = `${APP_URL}/conversations/${opts.conversationId}`;
    const recipFirst = firstName(
      recipient.profile.display_name,
      recipient.profile.email
    );
    const subject = `${senderName} (or their twin) sent something new`;
    const text = `Hey ${recipFirst},\n\nNew activity in your conversation with ${senderName}. Open the thread to read it.\n\n${convUrl}\n\n— SyncedIn`;
    const html = renderEmailHtml({
      preheader: `New activity from ${senderName}.`,
      heading: `New message from ${senderName}`,
      body: `<p>Hey ${recipFirst},</p><p>Your conversation with ${senderName} just updated. You can edit any draft your twin proposes before it gets sent.</p>`,
      ctaText: "Open conversation",
      ctaUrl: convUrl,
      footerNote: `Debounced to one alert per 30 minutes. Manage in notification settings.`
    });

    // Use messageId in the dedupe key so we never double-send the same message.
    await logAndSend({
      userId: recipientId,
      kind: "new_message",
      dedupeKey: `new_message:${opts.messageId}:${recipientId}`,
      subjectId: opts.conversationId,
      to,
      subject,
      text,
      html,
      ...phoneRoute(recipient)
    });
  } catch (e) {
    console.warn("[notify] new-message threw", e);
  }
}

// ---------------------------------------------------------------------------
// Agreement accepted — fires for both participants when both have accepted.
// ---------------------------------------------------------------------------

export async function notifyAgreementSealed(opts: {
  conversationId: string;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const { data: conv } = await service
      .from("conversations")
      .select("participant_a, participant_b")
      .eq("id", opts.conversationId)
      .maybeSingle();
    if (!conv) return;
    await Promise.all([
      sendAgreementOne(opts.conversationId, conv.participant_a, conv.participant_b),
      sendAgreementOne(opts.conversationId, conv.participant_b, conv.participant_a)
    ]);
  } catch (e) {
    console.warn("[notify] agreement-sealed threw", e);
  }
}

async function sendAgreementOne(
  conversationId: string,
  recipientId: string,
  otherId: string
): Promise<void> {
  const recipient = await loadRecipient(recipientId);
  const other = await loadRecipient(otherId);
  if (!recipient || !other) return;
  if (!recipient.prefs.on_agreement_accepted) return;
  // Push (no-spam policy): the deal-sealed moment, deduped per
  // conversation per recipient inside lib/push.
  sendPushToUser(
    recipientId,
    conversationId,
    "push_sealed",
    "Deal sealed",
    `You and ${
      other.profile.display_name || "your counterpart"
    } are locked in. Time to make it real.`
  ).catch(() => {});
  const to = recipient.prefs.email_address || recipient.profile.email;
  if (!to) return;

  const service = createServiceClient();
  const { data: isPersona } = await service
    .from("profiles")
    .select("is_test_persona")
    .eq("id", recipientId)
    .maybeSingle();
  if (isPersona?.is_test_persona) return;

  const otherName =
    other.profile.display_name || other.profile.email || "Your counterpart";
  const recipFirst = firstName(
    recipient.profile.display_name,
    recipient.profile.email
  );
  const convUrl = `${APP_URL}/conversations/${conversationId}`;
  const subject = `Deal: you & ${otherName} both agreed`;
  const text = `Hey ${recipFirst},\n\nYou and ${otherName} both accepted the proposed agreement. Time to make it real.\n\n${convUrl}\n\n— SyncedIn`;
  const html = renderEmailHtml({
    preheader: `You and ${otherName} both accepted the agreement.`,
    heading: `It's a deal with ${otherName}`,
    body: `<p>Hey ${recipFirst},</p><p>You both accepted the proposed agreement. Time to take it into the real world — schedule a call, send the doc, ship the thing.</p>`,
    ctaText: "Open conversation",
    ctaUrl: convUrl,
    footerNote: `Agreement notifications are on. Manage in notification settings.`
  });
  await logAndSend({
    userId: recipientId,
    kind: "agreement_accepted",
    dedupeKey: `agreement_accepted:${conversationId}:${recipientId}`,
    subjectId: conversationId,
    to,
    subject,
    text,
    html,
    ...phoneRoute(recipient)
  });
}

// ---------------------------------------------------------------------------
// Acceptance nudge — when ONE side accepts, tell the other side the deal is
// one tap from sealing. Without this, accepts die in "waiting on X" because
// the counterpart is never told (Jack hit this with Sampreeth).
// ---------------------------------------------------------------------------

export async function notifyAcceptanceNudge(opts: {
  conversationId: string;
  acceptedByUserId: string;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const { data: conv } = await service
      .from("conversations")
      .select("participant_a, participant_b")
      .eq("id", opts.conversationId)
      .maybeSingle();
    if (!conv) return;
    const recipientId =
      conv.participant_a === opts.acceptedByUserId
        ? conv.participant_b
        : conv.participant_a;
    const recipient = await loadRecipient(recipientId);
    const accepter = await loadRecipient(opts.acceptedByUserId);
    if (!recipient || !accepter) return;
    if (!recipient.prefs.on_agreement_accepted) return;
    // Push (no-spam policy: deal moments only; deduped + 3/day capped
    // inside lib/push). Personas never have tokens, so persona-safe.
    sendPushToUser(
      recipientId,
      opts.conversationId,
      "push_accept_nudge",
      "One tap to seal it",
      `${
        accepter.profile.display_name || "Your counterpart"
      } accepted your proposed outcome.`
    ).catch(() => {});
    const to = recipient.prefs.email_address || recipient.profile.email;
    if (!to) return;
    const { data: isPersona } = await service
      .from("profiles")
      .select("is_test_persona")
      .eq("id", recipientId)
      .maybeSingle();
    if (isPersona?.is_test_persona) return;

    const accepterName =
      accepter.profile.display_name ||
      accepter.profile.email ||
      "Your counterpart";
    const recipFirst = firstName(
      recipient.profile.display_name,
      recipient.profile.email
    );
    const convUrl = `${APP_URL}/conversations/${opts.conversationId}`;
    const subject = `${accepterName} accepted your proposed outcome`;
    const text = `Hey ${recipFirst},

${accepterName} just accepted the outcome your twins negotiated. It becomes a sealed deal the moment you accept too.

${convUrl}

— SyncedIn`;
    const html = renderEmailHtml({
      preheader: `${escapeHtml(accepterName)} accepted. One tap left to seal it.`,
      heading: `${escapeHtml(accepterName)} said yes`,
      body: `<p>Hey ${escapeHtml(recipFirst)},</p><p>${escapeHtml(
        accepterName
      )} accepted the outcome your twins negotiated. It becomes a sealed deal the moment you accept too. Review it and make the call.</p>`,
      ctaText: "Review & accept",
      ctaUrl: convUrl,
      footerNote: `Agreement notifications are on. Manage in notification settings.`
    });
    await logAndSend({
      userId: recipientId,
      kind: "agreement_nudge",
      dedupeKey: `agreement_nudge:${opts.conversationId}:${recipientId}`,
      subjectId: opts.conversationId,
      to,
      subject,
      text,
      html,
      ...phoneRoute(recipient)
    });
  } catch (e) {
    console.warn("[notify] acceptance-nudge threw", e);
  }
}

// ---------------------------------------------------------------------------
// Call scheduled — when a twin proposes a meeting time the user confirms.
// Used by the future "schedule a call" UI; safe to wire now.
// ---------------------------------------------------------------------------

export async function notifyCallScheduled(opts: {
  conversationId: string;
  recipientId: string;
  callTimeIso: string;
  callDescription?: string;
}): Promise<void> {
  try {
    const recipient = await loadRecipient(opts.recipientId);
    if (!recipient) return;
    if (!recipient.prefs.on_call_scheduled) return;
    const to = recipient.prefs.email_address || recipient.profile.email;
    if (!to) return;
    const convUrl = `${APP_URL}/conversations/${opts.conversationId}`;
    const when = new Date(opts.callTimeIso).toLocaleString();
    const recipFirst = firstName(
      recipient.profile.display_name,
      recipient.profile.email
    );
    const subject = `Call scheduled: ${when}`;
    const text = `Hey ${recipFirst},\n\nYour twin scheduled a call: ${when}. ${opts.callDescription || ""}\n\n${convUrl}\n\n— SyncedIn`;
    const html = renderEmailHtml({
      preheader: `Call scheduled for ${when}.`,
      heading: `Call scheduled — ${when}`,
      body: `<p>Hey ${recipFirst},</p><p>Your twin locked in a call.</p>${opts.callDescription ? `<p><em>${opts.callDescription}</em></p>` : ""}`,
      ctaText: "Open conversation",
      ctaUrl: convUrl
    });
    await logAndSend({
      userId: opts.recipientId,
      kind: "call_scheduled",
      dedupeKey: `call_scheduled:${opts.conversationId}:${opts.callTimeIso}`,
      subjectId: opts.conversationId,
      to,
      subject,
      text,
      html,
      ...phoneRoute(recipient)
    });
  } catch (e) {
    console.warn("[notify] call-scheduled threw", e);
  }
}

// ---------------------------------------------------------------------------
// New match — fires when a newly-onboarded user has a pair-score above
// an existing user's threshold. Called from the onboarding save action
// AFTER the new user's twin_profile is committed. Iterates over existing
// users with on_new_match=true and pings each whose threshold the new
// user crosses. Heavy-handed query; capped at 200 candidates by default
// so an active platform doesn't spam everyone on every signup.
// ---------------------------------------------------------------------------

export async function notifyNewMatch(opts: {
  newUserId: string;
  /** Cap so signups don't fan out to the entire platform during early
   *  growth — only the most-recently-active candidates get matched. */
  maxCandidates?: number;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const max = opts.maxCandidates ?? 200;

    // Pull the new user's twin snapshot for scoring.
    const { data: newTwin } = await service
      .from("twin_profiles")
      .select(
        "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob"
      )
      .eq("user_id", opts.newUserId)
      .maybeSingle();
    if (!newTwin) return;

    const { data: newProfile } = await service
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .eq("id", opts.newUserId)
      .maybeSingle();
    if (!newProfile) return;
    const newName =
      (newProfile as any).display_name ||
      (newProfile as any).email ||
      "Someone new";

    // Candidate set: every other user with a substantive twin profile.
    // Capped at `max` ordered by most-recent activity so we don't crawl
    // the whole platform on every signup.
    const { data: candidates } = await service
      .from("twin_profiles")
      .select(
        "user_id, goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, updated_at"
      )
      .neq("user_id", opts.newUserId)
      .order("updated_at", { ascending: false })
      .limit(max);

    for (const c of (candidates ?? []) as Array<TwinSnapshot & {
      user_id: string;
    }>) {
      // Score this pair using the same deterministic function the UI uses.
      const score = computePairScore(newTwin as TwinSnapshot, c);
      if (score < 30) continue; // hard floor — no point checking thresholds below this

      // Load this candidate's prefs to compare threshold + toggle.
      const recipient = await loadRecipient(c.user_id);
      if (!recipient) continue;
      if (!recipient.prefs.on_new_match) continue;
      if (score < recipient.prefs.match_threshold) continue;

      const to =
        recipient.prefs.email_address || recipient.profile.email;
      if (!to) continue;

      // Skip test personas — never email seeded twins.
      const { data: isPersona } = await service
        .from("profiles")
        .select("is_test_persona")
        .eq("id", c.user_id)
        .maybeSingle();
      if ((isPersona as any)?.is_test_persona) continue;

      const recipFirst = firstName(
        recipient.profile.display_name,
        recipient.profile.email
      );
      // Find-or-create the conversation between the two twins so the email
      // CTA drops the recipient straight INTO it (Jack: "rather than open
      // dashboard, it should open that conversation").
      let convId: string | null = null;
      try {
        const { data: existingConv } = await service
          .from("conversations")
          .select("id")
          .or(
            `and(participant_a.eq.${opts.newUserId},participant_b.eq.${c.user_id}),and(participant_a.eq.${c.user_id},participant_b.eq.${opts.newUserId})`
          )
          .maybeSingle();
        if (existingConv) {
          convId = (existingConv as any).id as string;
        } else {
          const { data: created } = await service
            .from("conversations")
            .insert({ participant_a: c.user_id, participant_b: opts.newUserId })
            .select("id")
            .single();
          convId = (created as any)?.id ?? null;
        }
      } catch {
        /* fall back to dashboard link below */
      }
      const ctaUrl = convId
        ? `${APP_URL}/conversations/${convId}`
        : `${APP_URL}/dashboard`;

      const subject = `New twin: ${newName} (${score}% match)`;
      const text = `Hey ${recipFirst},\n\n${newName} just set up their twin on SyncedIn and it lights up at ${score}% match against yours (your threshold is ${recipient.prefs.match_threshold}%). Open the conversation and let your twins find the win-win:\n\n${ctaUrl}\n\n— SyncedIn`;
      const html = renderEmailHtml({
        preheader: `${newName} is a ${score}% match with your twin.`,
        kicker: "New match",
        heading: `${newName} is a ${score}% match`,
        syncScore: score,
        // Show the matched person's real photo (initials fallback for
        // either side that has none) instead of a naked gray avatar.
        heroAvatars: {
          mine: null,
          theirs: (newProfile as any).avatar_url ?? null,
          mineInitials: recipFirst.slice(0, 2),
          theirsInitials: (newName || "?").slice(0, 2)
        } as any,
        body: `<p>Hey ${recipFirst},</p><p><strong>${newName}</strong> just set up their twin and it lines up at <strong>${score}%</strong> against yours, above your <strong>${recipient.prefs.match_threshold}%</strong> threshold. Open the conversation and let the two twins find the win-win.</p>`,
        ctaText: "Open the conversation",
        ctaUrl,
        footerNote: `You're getting this because your match threshold is set to ${recipient.prefs.match_threshold}% in notification settings. Reply STOP-style via the unsubscribe link to mute these.`
      });

      await logAndSend({
        userId: c.user_id,
        kind: "new_match",
        dedupeKey: `new_match:${opts.newUserId}:${c.user_id}`,
        subjectId: opts.newUserId,
        to,
        subject,
        text,
        html,
        ...phoneRoute(recipient)
      });
    }
  } catch (e) {
    console.warn("[notify] new-match threw", e);
  }
}
