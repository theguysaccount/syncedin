import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Set the social/OG image template for a room (Jack: give hosts simple
 * templates so a text-heavy banner doesn't collide with overlay text).
 * Stored in brand_meta.og_template (no migration). Owner-only.
 *
 * POST { template: "banner_text" | "banner_clean" | "card" }
 */
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["banner_text", "banner_clean", "card"]);

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { template?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const template = String(body.template || "");
  if (!ALLOWED.has(template)) {
    return NextResponse.json({ error: "bad_template" }, { status: 400 });
  }

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
    og_template: template
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
  return NextResponse.json({ ok: true, template });
}
