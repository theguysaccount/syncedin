import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Register (or refresh) a push device token. Called by PushRegistrar
 * from the native apps after the user grants permission. Upsert keyed
 * on the token itself so a device that changes owners re-binds cleanly.
 *
 * POST { token, platform: "ios" | "android" } → 204
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const token = (body.token ?? "").toString().trim();
  const platform = (body.platform ?? "").toString().trim();
  if (!token || token.length > 4096) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "bad_platform" }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    await service.from("push_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "token" }
    );
  } catch {
    /* table missing pre-migration: silently accept, app keeps working */
  }
  return new NextResponse(null, { status: 204 });
}
