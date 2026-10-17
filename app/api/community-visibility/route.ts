import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Toggle community/conference visibility (Public / RequestToJoin /
 * Private). Only the owner can change. Also handles join requests:
 *   - POST { kind: "join_request", community_id|conference_id }
 *     → creates a pending join request (visibility=request rooms)
 *   - POST { kind: "decide", request_id, status: "approved"|"rejected" }
 *     → owner approves/rejects a pending request
 *   - POST { kind: "set_visibility", community_id|conference_id, visibility }
 *     → owner flips the room's visibility
 */
export const dynamic = "force-dynamic";

const ALLOWED_VIS = ["public", "request", "private"] as const;

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const kind = String(body?.kind ?? "");
  const service = createServiceClient();

  if (kind === "set_visibility") {
    // Communities + conferences share the same table — accept either
    // input field as the room slug.
    const room = body?.conference_id ?? body?.community_id ?? null;
    const visibility = String(body?.visibility ?? "");
    if (!ALLOWED_VIS.includes(visibility as any)) {
      return NextResponse.json({ error: "bad_visibility" }, { status: 400 });
    }
    if (!room) {
      return NextResponse.json(
        { error: "missing_room_id" },
        { status: 400 }
      );
    }
    const { data: row } = await service
      .from("conferences")
      .select("slug, owner_user_id")
      .eq("slug", room)
      .maybeSingle();
    if (!row || (row as any).owner_user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await service
      .from("conferences")
      .update({ visibility })
      .eq("slug", room);
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, visibility });
  }

  if (kind === "join_request") {
    const room = body?.conference_id ?? body?.community_id ?? null;
    const note = (body?.note ?? "").toString().slice(0, 600).trim() || null;
    if (!room) {
      return NextResponse.json(
        { error: "missing_room_id" },
        { status: 400 }
      );
    }
    const { error } = await service.from("community_join_requests").insert({
      conference_id: room,
      user_id: user.id,
      note
    });
    if (error) {
      if (
        /relation .* does not exist|schema cache/i.test(error.message)
      ) {
        return NextResponse.json(
          {
            error: "schema_missing",
            detail:
              "Run the latest supabase/schema.sql — community_join_requests table missing."
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === "decide") {
    const request_id = body?.request_id;
    const status = String(body?.status ?? "");
    if (!request_id || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "bad_decision" }, { status: 400 });
    }
    const { data: jr } = await service
      .from("community_join_requests")
      .select("id, conference_id, user_id")
      .eq("id", request_id)
      .maybeSingle();
    if (!jr) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { data: row } = await service
      .from("conferences")
      .select("slug, owner_user_id")
      .eq("slug", (jr as any).conference_id)
      .maybeSingle();
    if (!row || (row as any).owner_user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await service
      .from("community_join_requests")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", request_id);
    if (error) {
      return NextResponse.json(
        { error: "save_failed", detail: error.message },
        { status: 500 }
      );
    }
    // On approval, the room's membership join model still has to be
    // wired room-side (each room type already has its own member
    // table). For now we just stamp the request — the room's existing
    // "Join" flow takes care of the actual membership row.
    return NextResponse.json({ ok: true, status });
  }

  return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
}

export async function GET(req: Request) {
  // Public discovery: list rooms with visibility='public'. Used by the
  // homepage / index pages of /communities + /conferences.
  const url = new URL(req.url);
  const which = url.searchParams.get("kind") || "community";
  const table = which === "conference" ? "conferences" : "communities";
  const service = createServiceClient();
  try {
    const { data, error } = await service
      .from(table)
      .select("id, name, slug, description, visibility, created_at")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ rooms: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ rooms: [], _err: e?.message ?? null });
  }
}
