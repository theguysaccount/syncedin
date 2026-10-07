import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Auto-error-report sink. Every uncaught client-side error and unhandled
 * promise rejection POSTs here (see app/ErrorAutoReport.tsx). The goal:
 * Jack never has to discover broken states from screenshots — they land
 * in the feedback table tagged surface='auto-error' the moment they
 * happen.
 *
 * Schema reuse: writes into the existing `feedback` table (added in
 * supabase/schema.sql alongside the quick-feedback widget) so there's
 * one inbox for both manual reports + auto-captures. The `surface`
 * column distinguishes them.
 *
 * Auth optional — most errors fire for signed-out users on the public
 * /[slug] invite or auth flows, and we still want those reports.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let body: {
    message?: string;
    stack?: string;
    source?: string;
    url?: string;
    user_agent?: string;
    extras?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = (body.message ?? "").toString().slice(0, 2000);
  if (!message) {
    return NextResponse.json(
      { error: "missing_message" },
      { status: 400 }
    );
  }

  // Compose a single readable blob in the feedback.message column so
  // there's no schema migration required. Stack + URL + extras are
  // appended in a fixed format that's easy to grep for in Supabase.
  const lines: string[] = [`[auto-error] ${message}`];
  if (body.url) lines.push(`url: ${body.url}`);
  if (body.source) lines.push(`source: ${body.source}`);
  if (user?.email) lines.push(`user: ${user.email} (${user.id})`);
  if (body.extras && Object.keys(body.extras).length > 0) {
    try {
      lines.push(`extras: ${JSON.stringify(body.extras).slice(0, 800)}`);
    } catch {
      /* skip unserializable */
    }
  }
  if (body.stack) lines.push(`\nstack:\n${body.stack.slice(0, 4000)}`);
  const composed = lines.join("\n").slice(0, 8000);

  const surface =
    body.source && body.source.length < 80
      ? `auto-error:${body.source}`
      : "auto-error";
  const userAgent =
    body.user_agent ||
    req.headers.get("user-agent")?.slice(0, 300) ||
    null;

  // Compute a stable ack signature so the admin reports page can group
  // re-occurrences of the same error AND mark the whole group as acked
  // in one click. We strip volatile bits (UUIDs, hex addrs, numbers,
  // URLs) before hashing so the same React stack from different users
  // and timestamps collapses to one signature.
  const sigInput = (body.message ?? "")
    .toString()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b\d{6,}\b/g, "<n>")
    .replace(/https?:\/\/\S+/gi, "<url>")
    .slice(0, 220);

  const service = createServiceClient();
  const report = {
    user_id: user?.id ?? null,
    message: composed,
    image_data_url: null,
    surface,
    user_agent: userAgent,
    ack_signature: sigInput
  };
  let { error } = await service.from("feedback").insert(report);
  if (error?.code === "PGRST204" && error.message?.includes("ack_signature")) {
    // Older databases can still capture errors without the grouping column.
    const { ack_signature: _signature, ...compatibleReport } = report;
    ({ error } = await service.from("feedback").insert(compatibleReport));
  }
  if (error) {
    // The client reporter handles failures silently; do not claim delivery.
    console.error("[error-report] insert failed", error);
    return NextResponse.json({ ok: false, error: "report_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
