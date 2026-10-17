import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/export-messages
 *
 * Jack: "Let's have something for downloading all of your messages. I
 * think there's better ways than just copy, control A, control C."
 *
 * Returns a single JSON file containing every conversation the user
 * participates in + every message inside them, with counterpart
 * profile snippets so the file is self-contained. Streams as
 * `Content-Disposition: attachment` so browsers download it directly.
 *
 * Sister surface to /continuation (import). Linked from the TopBar
 * profile dropdown so both data ops live together.
 *
 * Format (JSON, indented):
 *   {
 *     "exported_at": "2026-05-31T...Z",
 *     "user": { id, display_name, email },
 *     "stats": { conversations, messages, sealed_deals },
 *     "conversations": [
 *       {
 *         "id", "slug", "created_at", "summary",
 *         "counterpart": { id, display_name, email },
 *         "messages": [
 *           { id, sender, text, sent_at, edited }, ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Privacy: only the requester's conversations are included. Each
 * message records who sent it (self vs counterpart) and the final
 * text the counterpart actually saw — never the pre-edit draft.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const service = createServiceClient();

  // 1. The user's own profile snippet
  const { data: meRow } = await service
    .from("profiles")
    .select("id, display_name, email, handle, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // 2. All conversations the user is a participant in
  const { data: convsRaw } = await service
    .from("conversations")
    .select(
      "id, slug, participant_a, participant_b, summary, counterpart_summary, status, created_at"
    )
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const convs = (convsRaw ?? []) as Array<{
    id: string;
    slug: string | null;
    participant_a: string;
    participant_b: string;
    summary: string | null;
    counterpart_summary: string | null;
    status: string | null;
    created_at: string;
  }>;

  // 3. Batch fetch counterpart profile snippets
  const otherIds = Array.from(
    new Set(
      convs.map((c) =>
        c.participant_a === user.id ? c.participant_b : c.participant_a
      )
    )
  );
  let profilesById = new Map<
    string,
    { id: string; display_name: string | null; email: string | null }
  >();
  if (otherIds.length > 0) {
    const { data: profs } = await service
      .from("profiles")
      .select("id, display_name, email")
      .in("id", otherIds);
    profilesById = new Map(
      ((profs ?? []) as any[]).map((p) => [p.id as string, p])
    );
  }

  // 4. Batch fetch every message across all conversations in one query
  const convIds = convs.map((c) => c.id);
  let messagesByConv = new Map<
    string,
    Array<{
      id: string;
      sender_user_id: string;
      final_text: string;
      sent_at: string;
      edited: boolean | null;
    }>
  >();
  let totalMessages = 0;
  if (convIds.length > 0) {
    const { data: msgs } = await service
      .from("messages")
      .select("id, conversation_id, sender_user_id, final_text, sent_at, edited")
      .in("conversation_id", convIds)
      .order("sent_at", { ascending: true });
    for (const m of ((msgs ?? []) as any[])) {
      const list = messagesByConv.get(m.conversation_id) ?? [];
      list.push(m as any);
      messagesByConv.set(m.conversation_id, list);
      totalMessages++;
    }
  }

  // 5. Count sealed deals — both sides accepted on the same conversation
  let sealedCount = 0;
  if (convIds.length > 0) {
    const { data: resps } = await service
      .from("agreement_responses")
      .select("conversation_id, user_id, response")
      .in("conversation_id", convIds)
      .eq("response", "accepted");
    const acceptsByConv = new Map<string, Set<string>>();
    for (const r of ((resps ?? []) as any[])) {
      const s = acceptsByConv.get(r.conversation_id) ?? new Set<string>();
      s.add(r.user_id);
      acceptsByConv.set(r.conversation_id, s);
    }
    for (const c of convs) {
      const s = acceptsByConv.get(c.id);
      if (s && s.has(c.participant_a) && s.has(c.participant_b)) sealedCount++;
    }
  }

  // 6. Build the export body
  const myName =
    (meRow as any)?.display_name || (meRow as any)?.email || "You";

  const exportBody = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    user: {
      id: user.id,
      display_name: (meRow as any)?.display_name ?? null,
      email: (meRow as any)?.email ?? null,
      handle: (meRow as any)?.handle ?? null,
      created_at: (meRow as any)?.created_at ?? null
    },
    stats: {
      conversations: convs.length,
      messages: totalMessages,
      sealed_deals: sealedCount
    },
    conversations: convs.map((c) => {
      const otherId =
        c.participant_a === user.id ? c.participant_b : c.participant_a;
      const other = profilesById.get(otherId);
      const otherName = other?.display_name || other?.email || "Counterpart";
      const msgs = messagesByConv.get(c.id) ?? [];
      return {
        id: c.id,
        slug: c.slug,
        created_at: c.created_at,
        status: c.status,
        summary: c.summary,
        counterpart_summary: c.counterpart_summary,
        counterpart: {
          id: otherId,
          display_name: other?.display_name ?? null,
          email: other?.email ?? null
        },
        messages: msgs.map((m) => ({
          id: m.id,
          sender:
            m.sender_user_id === user.id ? "self" : "counterpart",
          sender_name: m.sender_user_id === user.id ? myName : otherName,
          text: m.final_text,
          sent_at: m.sent_at,
          edited: !!m.edited
        }))
      };
    })
  };

  // 7. Stream as a downloadable JSON file
  const json = JSON.stringify(exportBody, null, 2);
  const filename = `syncedin-messages-${
    new Date().toISOString().slice(0, 10)
  }.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store"
    }
  });
}
