import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/twin/proposals
 *
 * Returns the authenticated user's pending proposals for the right-rail
 * panel on /twin. A proposal is "pending" when:
 *   - the conversation has a summary set (the twins agreed on something)
 *   - this user has NOT yet inserted an agreement_responses row
 *
 * Shape: { proposals: [{ conversation_id, counterpart_name,
 *          counterpart_avatar, counterpart_handle, summary, created_at,
 *          counterpart_summary }] }
 *
 * The twin chat references these by counterpart name so the user can
 * scan + tap Accept/Deny directly in the rail instead of leaving the
 * page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();

  try {
    // Pull all conversations with a settled summary involving this user.
    const { data: convs } = await service
      .from("conversations")
      .select(
        "id, participant_a, participant_b, summary, counterpart_summary, created_at"
      )
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .not("summary", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);
    const convList = (convs ?? []) as any[];
    if (convList.length === 0) {
      return NextResponse.json({ proposals: [] });
    }
    const convIds = convList.map((c) => c.id);

    // Filter out ones where this user has already responded.
    const { data: resps } = await service
      .from("agreement_responses")
      .select("conversation_id")
      .eq("user_id", user.id)
      .in("conversation_id", convIds);
    const responded = new Set(
      (resps ?? []).map((r: any) => r.conversation_id)
    );
    const pending = convList.filter((c) => !responded.has(c.id));
    if (pending.length === 0) {
      return NextResponse.json({ proposals: [] });
    }

    // Pull counterpart profile details (whichever participant isn't us).
    const counterpartIds = Array.from(
      new Set(
        pending.map((c) =>
          c.participant_a === user.id ? c.participant_b : c.participant_a
        )
      )
    );
    const { data: profs } = await service
      .from("profiles")
      .select("id, display_name, avatar_url, handle")
      .in("id", counterpartIds);
    const byId = new Map<string, any>(
      ((profs ?? []) as any[]).map((p) => [p.id, p])
    );

    const proposals = pending.map((c) => {
      const counterpartId =
        c.participant_a === user.id ? c.participant_b : c.participant_a;
      const cp = byId.get(counterpartId) ?? {};
      return {
        conversation_id: c.id,
        counterpart_id: counterpartId,
        counterpart_name:
          (cp.display_name as string | undefined) ||
          (cp.handle as string | undefined) ||
          "Someone",
        counterpart_avatar: (cp.avatar_url as string | null) ?? null,
        counterpart_handle: (cp.handle as string | null) ?? null,
        summary: (c.summary as string) ?? "",
        counterpart_summary: (c.counterpart_summary as string) ?? "",
        created_at: c.created_at
      };
    });

    return NextResponse.json({ proposals });
  } catch (e: any) {
    return NextResponse.json(
      { proposals: [], error: e?.message ?? "fetch_failed" },
      { status: 200 }
    );
  }
}
