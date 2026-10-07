import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Submit an account report. Anyone signed-in can report any other user.
 * Writes to public.account_reports + fires a notification email to
 * jacksonjezio@gmail.com so reports never sit unseen.
 */
const VALID_CATEGORIES = new Set([
  "spam",
  "harassment",
  "objectionable-content",
  "impersonation",
  "off-platform",
  "fake-profile",
  "other"
]);

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    reported_user_id?: string;
    category?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || typeof body.reported_user_id !== "string" || (body.category !== undefined && typeof body.category !== "string") || (body.reason !== undefined && typeof body.reason !== "string")) {
    return NextResponse.json({ error: "invalid_report" }, { status: 400 });
  }
  const reported = body.reported_user_id.trim();
  const category = (body.category ?? "other").trim();
  const reason = (body.reason ?? "").trim().slice(0, 2000);

  if (!reported) {
    return NextResponse.json(
      { error: "missing_reported_user_id" },
      { status: 400 }
    );
  }
  if (reported === user.id) {
    return NextResponse.json(
      { error: "cannot_report_self" },
      { status: 400 }
    );
  }
  const cat = VALID_CATEGORIES.has(category) ? category : "other";

  const service = createServiceClient();
  const { error } = await service.from("account_reports").insert({
    reporter_user_id: user.id,
    reported_user_id: reported,
    category: cat,
    reason: reason || null
  });
  if (error) {
    console.error("[report-account] insert failed", error);
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }

  // Await the alert before the serverless request ends.
  await (async () => {
    try {
      const { sendEmail } = await import("@/lib/email");
      const { data: reporterProf } = await service
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const { data: reportedProf } = await service
        .from("profiles")
        .select("display_name, email")
        .eq("id", reported)
        .maybeSingle();
      const reporterName =
        (reporterProf as any)?.display_name ||
        (reporterProf as any)?.email ||
        user.id;
      const reportedName =
        (reportedProf as any)?.display_name ||
        (reportedProf as any)?.email ||
        reported;
      // sendEmail signature is { to, subject, text?, html?, replyTo? }.
      // Pass html (not body) and append the review link inline since
      // there's no footerNote param.
      await sendEmail({
        to: "jacksonjezio@gmail.com",
        subject: `[SyncedIn report] ${cat} — ${reportedName}`,
        text: `Reporter: ${reporterName} (${user.id})\nReported: ${reportedName} (${reported})\nCategory: ${cat}\n\nReason:\n${reason || "(no reason given)"}\n\nReview at https://syncedin.org/admin/safety`,
        html: `<p><strong>Category:</strong> ${cat}</p><p><strong>Reporter:</strong> ${reporterName} (${user.id})</p><p><strong>Reported:</strong> ${reportedName} (${reported})</p><p><strong>Reason:</strong></p><pre style="white-space:pre-wrap;font-family:inherit">${(reason || "(no reason given)").replace(/</g, "&lt;")}</pre><p style="font-size:12px;color:#888;margin-top:14px;">Review at <a href="https://syncedin.org/admin/safety">/admin/safety</a></p>`
      });
    } catch (e) {
      console.warn("[report-account] notify email failed", e);
    }
  })();

  return NextResponse.json({ ok: true });
}
