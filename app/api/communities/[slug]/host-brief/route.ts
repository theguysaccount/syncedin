import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Update the host's brief on a community/conference page (#15).
 *
 * Owner-only. Two scopes:
 *   - "global" → writes profiles.portfolio_about (the host's brief
 *     everywhere on SyncedIn).
 *   - "local"  → writes conferences.host_brief (an override that only
 *     shows on THIS room's page).
 *
 * Jack: "I, as that person, should be allowed to edit that brief. And
 * then it should ask, 'Edit globally or just here?'"
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

  let body: { text?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.text ?? "").toString().trim().slice(0, 2000);
  const scope = (body.scope ?? "").toString();
  if (!text) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }
  if (scope !== "global" && scope !== "local") {
    return NextResponse.json({ error: "bad_scope" }, { status: 400 });
  }

  const slug = (params.slug || "").toLowerCase();
  const service = createServiceClient();

  // Ownership: only the room owner may edit the host brief.
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

  if (scope === "global") {
    const { error } = await service
      .from("profiles")
      .update({ portfolio_about: text })
      .eq("id", user.id);
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, scope: "global" });
  }

  // Local override on the conference row.
  const { error } = await service
    .from("conferences")
    .update({ host_brief: text })
    .eq("slug", slug);
  if (error) {
    // Most likely the host_brief column isn't migrated yet.
    return NextResponse.json(
      {
        error: "save_failed",
        detail:
          /column .* does not exist/i.test(error.message)
            ? "Run supabase/migrations/0002_conference_host_brief.sql to enable per-room briefs."
            : error.message
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, scope: "local" });
}
