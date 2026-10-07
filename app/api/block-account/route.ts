import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const target = body?.blocked_user_id;
  if (typeof target !== "string" || !/^[0-9a-f-]{36}$/i.test(target) || target === user.id)
    return NextResponse.json({ error: "invalid_account" }, { status: 400 });
  const service = createServiceClient();
  const { error } = await service.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: target }, { onConflict: "blocker_id,blocked_id" });
  if (error) return NextResponse.json({ error: "Couldn't block this account. Try again." }, { status: 503 });
  // The durable report is the review queue; notification delivery is awaited.
  const { error: reportError } = await service.from("account_reports").insert({
    reporter_user_id: user.id, reported_user_id: target, category: "harassment", reason: "Account blocked by the reporting user. Review within 24 hours."
  });
  if (reportError) console.error("[block-account] moderation queue failed", reportError.code);
  try {
    await sendEmail({ to: "jacksonjezio@gmail.com", subject: "[SyncedIn safety] Account blocked",
      text: `User ${user.id} blocked ${target}. Review the account and associated content within 24 hours: https://syncedin.org/admin/safety` });
  } catch { console.error("[block-account] review alert failed; block remains active"); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.blocked_user_id !== "string") return NextResponse.json({ error: "invalid_account" }, { status: 400 });
  const { error } = await createServiceClient().from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", body.blocked_user_id);
  return error ? NextResponse.json({ error: "Couldn't unblock this account." }, { status: 503 }) : NextResponse.json({ ok: true });
}
