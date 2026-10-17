import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Save a community/conference banner image (#banner).
 *
 * Owner-only. Stores the (client-resized) image data URL into
 * conferences.cover_url — the same data-URL pattern avatars use, so no
 * storage bucket is required. The banner doubles as the OG/meta image
 * (see app/conferences/[slug]/opengraph-image.tsx).
 *
 * POST { cover_url }  → set/replace
 * POST { cover_url: "" } → clear
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

  let body: { cover_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const coverUrl = (body.cover_url ?? "").toString();
  // ~2.5MB cap on the data URL (a 1200-wide JPEG resized client-side is
  // well under this; guards against someone POSTing a raw 10MB image).
  if (coverUrl.length > 2_600_000) {
    return NextResponse.json(
      { error: "too_large", detail: "Image too large — try a smaller file." },
      { status: 400 }
    );
  }
  if (coverUrl && !/^data:image\/|^https?:\/\//.test(coverUrl)) {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  const slug = (params.slug || "").toLowerCase();
  const service = createServiceClient();
  const { data: conf } = await service
    .from("conferences")
    .select("slug, owner_user_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!conf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if ((conf as any).owner_user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await service
    .from("conferences")
    .update({ cover_url: coverUrl || null })
    .eq("slug", slug);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
