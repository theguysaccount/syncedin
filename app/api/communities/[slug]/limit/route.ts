import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Set/clear a room's member limit (Jack: "allow a group limit … gives
 * pressure for people to join"). Stored in the existing brand_meta jsonb
 * (no migration). Owner-only.
 *
 * POST { limit }  — positive integer to set, 0/null to clear.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { limit?: number | string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = Number(body.limit);
  const limit =
    !raw || !Number.isFinite(raw) || raw <= 0
      ? null
      : Math.min(100000, Math.floor(raw));

  const slug = (params.slug || "").toLowerCase();
  const service = createServiceClient();
  const { data: conf } = await service
    .from("conferences")
    .select("slug, owner_user_id, brand_meta")
    .eq("slug", slug)
    .maybeSingle();
  if (!conf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if ((conf as any).owner_user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const meta = {
    ...(((conf as any).brand_meta as Record<string, unknown>) ?? {}),
    member_limit: limit
  };
  const { error } = await service
    .from("conferences")
    .update({ brand_meta: meta })
    .eq("slug", slug);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, limit });
}
