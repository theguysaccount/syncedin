import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailHtml } from "@/lib/email";

/**
 * Admin email diagnostic — answers "why am I not getting any emails?"
 *
 * Returns a single JSON blob with:
 *   - env_ok: { has_resend_key, has_from, has_cron_secret, has_unsub_secret }
 *   - last_log: most recent notification_log entries (kind, channels, sent_at)
 *   - my_prefs: the admin's current notification_preferences row
 *   - send_probe (when ?probe=1): actually attempts a send to jack's address
 *     so we can see the Resend response surfaced.
 *
 * Gated to ADMIN_EMAIL so only Jack can run it. Hit:
 *   /api/admin/email-diagnose         → status check
 *   /api/admin/email-diagnose?probe=1 → also sends a test email
 */
const ADMIN_EMAIL = "jacksonjezio@gmail.com";

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || (user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const env_ok = {
    has_resend_key: !!process.env.RESEND_API_KEY,
    has_claw_key: !!process.env.CLAW_MESSENGER_API_KEY,
    has_from: !!process.env.NOTIFICATION_FROM_EMAIL,
    has_cron_secret: !!process.env.CRON_SECRET,
    has_unsub_secret: !!process.env.NOTIFY_HMAC_SECRET,
    app_url:
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "(unset)"
  };

  const service = createServiceClient();
  let last_log: any[] = [];
  try {
    const { data } = await service
      .from("notification_log")
      .select("user_id, kind, sent_channels, email_address, phone_number, sent_at")
      .order("sent_at", { ascending: false })
      .limit(25);
    last_log = (data ?? []) as any[];
  } catch (e: any) {
    last_log = [{ _err: e?.message ?? "log read failed" }];
  }

  let my_prefs: any = null;
  try {
    const { data } = await service
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    my_prefs = data;
  } catch (e: any) {
    my_prefs = { _err: e?.message ?? "prefs read failed" };
  }

  // Optional live probe — sends a test email to the admin's address.
  const url = new URL(req.url);
  let probe_result: any = null;
  if (url.searchParams.get("probe") === "1") {
    const to = user.email!;
    const r = await sendEmail({
      to,
      subject: "SyncedIn email diagnostic probe",
      text: `Probe sent at ${new Date().toISOString()}. If you receive this in spam, check SPF/DKIM/DMARC on syncedin.org and Resend domain verification.`,
      html: renderEmailHtml({
        preheader: "Email pipeline probe",
        heading: "Probe received",
        body: `<p>If you're reading this, the send pipeline is working end-to-end.</p><p style="font-size:13px;color:#9ca3af;margin-top:14px;">Sent at <code>${new Date().toISOString()}</code> from /api/admin/email-diagnose?probe=1</p><p style="font-size:13px;color:#9ca3af;">If this hit spam: check Resend domain verification + SPF/DKIM/DMARC on syncedin.org → see <a href="https://resend.com/domains" style="color:#9ca3af;">resend.com/domains</a>.</p>`,
        ctaText: "Open dashboard",
        ctaUrl: "https://syncedin.org/dashboard"
      }),
      userId: user.id,
      category: "all"
    });
    probe_result = r;
  }

  return NextResponse.json({
    env_ok,
    my_prefs,
    last_log_count: last_log.length,
    last_log,
    probe_result,
    hint: env_ok.has_resend_key
      ? "Resend key set. If still no emails, check Resend dashboard for failed sends + domain verification status."
      : "RESEND_API_KEY is NOT set in env. Without it sendEmail() silently console.logs and returns ok:true,skipped:true — i.e. nothing ever sends. Add the key in Vercel env vars."
  });
}
