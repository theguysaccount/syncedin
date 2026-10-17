import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Atomic conference join.
 *
 * Hit by `/auth/callback?next=/conferences/<slug>/join` after a fresh signup
 * via a conference share link, or directly when a signed-in user clicks
 * "Join {name}" on an existing conference page. Idempotent: re-joining is a no-op.
 */
export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const url = new URL(req.url);
  const slug = (params.slug || "").toLowerCase();
  if (!slug) return NextResponse.redirect(`${url.origin}/dashboard`);

  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${url.origin}/login?conference=${slug}`);
  }

  const service = createServiceClient();
  const { data: conf } = await service
    .from("conferences")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!conf) {
    return NextResponse.redirect(
      `${url.origin}/dashboard?error=conference_not_found`
    );
  }

  // Upsert membership.
  await service.from("conference_members").upsert(
    {
      conference_slug: slug,
      user_id: user.id
    },
    { onConflict: "conference_slug,user_id" }
  );

  return NextResponse.redirect(`${url.origin}/conferences/${slug}`);
}
