import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailHtml, buildUnsubUrl } from "@/lib/email";

/**
 * Weekly proposals digest — sent Monday morning to every user with
 * on_weekly_digest = true and at least one open proposal waiting on them.
 *
 * Jack: "one of the email notifications we need to add is a weekly
 * summary of proposals with buttons so you can click right into those."
 *
 * Schedule via vercel.json (or an external cron hitting this URL with
 * the CRON_SECRET header). Idempotent: notification_log records each
 * send so re-runs in the same week skip already-emailed users.
 *
 * Auth: requires `?secret=<CRON_SECRET>` query param or
 * `x-cron-secret` header matching env. Without env CRON_SECRET, the
 * route 401s — so the first deploy doesn't open a backdoor.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://syncedin.org"
).replace(/\/$/, "");

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  // Accept three auth shapes:
  //   1. ?secret=... query param (manual ops trigger)
  //   2. x-cron-secret header (custom external schedulers)
  //   3. Authorization: Bearer <secret> (Vercel sends this for scheduled
  //      cron invocations automatically — see vercel.json)
  const authHeader = (req.headers.get("authorization") || "").trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const provided =
    url.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    bearer ||
    "";
  if (provided.length !== secret.length) return false;
  let ok = 0;
  for (let i = 0; i < secret.length; i++) {
    ok |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return ok === 0;
}

type ProposalRow = {
  id: string;
  participant_a: string;
  participant_b: string;
  summary: string | null;
  created_at: string;
};

type UserDigest = {
  userId: string;
  email: string;
  displayName: string;
  proposals: Array<{
    convId: string;
    otherName: string;
    summary: string;
    age: string;
  }>;
};

function relativeAge(iso: string): string {
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3.6e6);
  if (diffH < 24) return `${diffH}h ago`;
  const d = Math.floor(diffH / 24);
  if (d < 14) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const dryRun =
    new URL(req.url).searchParams.get("dry_run") === "1" ||
    process.env.WEEKLY_DIGEST_DRY_RUN === "1";

  // ----------------------------------------------------------------
  // 1) Pull every user with on_weekly_digest = true (default true so
  //    even users who never touched settings are opted in until they
  //    explicitly unsubscribe).
  // ----------------------------------------------------------------
  const { data: prefs } = await service
    .from("notification_preferences")
    .select("user_id, on_weekly_digest, email_address")
    .neq("on_weekly_digest", false);

  // Plus everyone who has no row at all (default = receive).
  const { data: allProfiles } = await service
    .from("profiles")
    .select("id, email, display_name");
  const eligibleIds = new Set<string>();
  const prefMap = new Map<string, { email_address: string | null }>();
  for (const p of (prefs ?? []) as any[]) {
    eligibleIds.add(p.user_id);
    prefMap.set(p.user_id, { email_address: p.email_address ?? null });
  }
  // Users with no prefs row: still eligible (default true) — add them.
  const profById = new Map<
    string,
    { email: string | null; display_name: string | null }
  >();
  for (const p of (allProfiles ?? []) as any[]) {
    profById.set(p.id, {
      email: p.email ?? null,
      display_name: p.display_name ?? null
    });
    if (!eligibleIds.has(p.id)) eligibleIds.add(p.id);
  }

  // ----------------------------------------------------------------
  // 2) Pull every conversation with a summary set (closed proposals).
  //    Group by user → list of proposals where user hasn't responded.
  // ----------------------------------------------------------------
  const { data: convs } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, summary, created_at")
    .not("summary", "is", null);

  const convList = ((convs ?? []) as ProposalRow[]).filter(
    (c) =>
      c.summary &&
      !/no\s+conversation\s+occurred|one[\s-]?sided\s+opener|no\s+response\s+from/i.test(
        c.summary
      )
  );
  const convIds = convList.map((c) => c.id);

  // Existing agreement_responses keyed on (conversation_id, user_id)
  const respByPair = new Set<string>();
  if (convIds.length > 0) {
    const { data: resps } = await service
      .from("agreement_responses")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds);
    for (const r of (resps ?? []) as any[]) {
      respByPair.add(`${r.conversation_id}:${r.user_id}`);
    }
  }

  // Build digest per eligible user
  const digests: UserDigest[] = [];
  for (const userId of Array.from(eligibleIds)) {
    const prof = profById.get(userId);
    if (!prof || !prof.email) continue;
    const owed: UserDigest["proposals"] = [];
    for (const c of convList) {
      const isParticipant =
        c.participant_a === userId || c.participant_b === userId;
      if (!isParticipant) continue;
      const otherId =
        c.participant_a === userId ? c.participant_b : c.participant_a;
      if (respByPair.has(`${c.id}:${userId}`)) continue;
      const otherProf = profById.get(otherId);
      owed.push({
        convId: c.id,
        otherName:
          otherProf?.display_name?.split(" ")[0] ||
          otherProf?.email?.split("@")[0] ||
          "Someone",
        summary: (c.summary ?? "").slice(0, 180),
        age: relativeAge(c.created_at)
      });
    }
    if (owed.length === 0) continue;
    digests.push({
      userId,
      email: (prefMap.get(userId)?.email_address || prof.email) as string,
      displayName: prof.display_name?.split(" ")[0] || "there",
      proposals: owed.slice(0, 10)
    });
  }

  // ----------------------------------------------------------------
  // 3) De-dupe: skip users who already got a weekly_digest in the
  //    last 6 days (record kept in notification_log).
  // ----------------------------------------------------------------
  let alreadySent = new Set<string>();
  try {
    const sixDaysAgo = new Date(
      Date.now() - 6 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: logs } = await service
      .from("notification_log")
      .select("user_id, kind, created_at")
      .eq("kind", "weekly_digest")
      .gte("created_at", sixDaysAgo);
    for (const l of (logs ?? []) as any[]) {
      alreadySent.add(l.user_id as string);
    }
  } catch {
    /* notification_log may not have a created_at index; safe to skip */
  }

  // ----------------------------------------------------------------
  // 4) Send. One email per user, one row in notification_log per send.
  // ----------------------------------------------------------------
  let sent = 0;
  let skipped = 0;
  const results: Array<{ userId: string; status: string }> = [];
  for (const d of digests) {
    if (alreadySent.has(d.userId)) {
      skipped += 1;
      results.push({ userId: d.userId, status: "already_sent_this_week" });
      continue;
    }
    const proposalsHtml = d.proposals
      .map(
        (p) =>
          `<tr><td style="padding:12px 0;border-top:1px solid #1f2937;">
  <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:4px;">${escapeHtml(
    p.otherName
  )} <span style="font-weight:400;color:#6b7280;font-size:12px;">· ${escapeHtml(
            p.age
          )}</span></div>
  <div style="color:#d1d5db;font-size:13px;line-height:1.45;margin-bottom:8px;">${escapeHtml(
    p.summary
  )}</div>
  <a href="${APP_URL}/conversations/${
    p.convId
  }" style="display:inline-block;background:#1f59ff;color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;font-weight:700;font-size:12px;margin-right:6px;">Review &amp; accept →</a>
  <a href="${APP_URL}/messages" style="display:inline-block;color:#6b7280;text-decoration:none;padding:7px 14px;font-weight:600;font-size:12px;">See all</a>
</td></tr>`
      )
      .join("");

    const unsub = buildUnsubUrl({
      userId: d.userId,
      category: "weekly_digest"
    });

    const html = renderEmailHtml({
      preheader: `${d.proposals.length} proposal${
        d.proposals.length === 1 ? "" : "s"
      } waiting on you on SyncedIn.`,
      heading: `${d.proposals.length} proposal${
        d.proposals.length === 1 ? "" : "s"
      } waiting on you, ${escapeHtml(d.displayName)}.`,
      body: `<p style="margin:0 0 14px 0;">Your twins lined up the following deals. Tap any of them to accept, counter, or reply.</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${proposalsHtml}</table>`,
      ctaText: "Open all proposals →",
      ctaUrl: `${APP_URL}/messages`,
      footerNote: `Weekly digest · <a href="${APP_URL}/settings/notifications" style="color:#9ca3af;">manage</a> · <a href="${unsub}" style="color:#9ca3af;">unsubscribe</a>`
    });

    const text = [
      `${d.proposals.length} proposal${
        d.proposals.length === 1 ? "" : "s"
      } waiting on you, ${d.displayName}.`,
      "",
      ...d.proposals.map(
        (p) =>
          `· ${p.otherName} (${p.age}): ${p.summary}\n  ${APP_URL}/conversations/${p.convId}`
      ),
      "",
      `Open all proposals: ${APP_URL}/messages`,
      `Unsubscribe: ${unsub}`
    ].join("\n");

    if (dryRun) {
      results.push({ userId: d.userId, status: "dry_run_skipped_send" });
      continue;
    }

    const send = await sendEmail({
      to: d.email,
      subject: `${d.proposals.length} proposal${
        d.proposals.length === 1 ? "" : "s"
      } waiting on you · SyncedIn`,
      text,
      html,
      userId: d.userId,
      category: "weekly_digest"
    });
    if (send.ok) {
      sent += 1;
      results.push({ userId: d.userId, status: "sent" });
      try {
        await service.from("notification_log").insert({
          user_id: d.userId,
          kind: "weekly_digest",
          channel: "email",
          payload: { count: d.proposals.length }
        });
      } catch {
        /* log table may not exist on every DB */
      }
    } else {
      results.push({
        userId: d.userId,
        status: `send_failed:${(send as any).error ?? "unknown"}`
      });
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: eligibleIds.size,
    with_proposals: digests.length,
    sent,
    skipped,
    dry_run: dryRun,
    sample_result_count: results.length,
    sample_results: results.slice(0, 25)
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
