import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Return the full AGREEMENT text the twins landed on inside a
 * conversation. Used by /proposals's "expand" button so the user
 * can read the long-form deal both twins converged on (vs. the
 * short summary which is the headline only).
 *
 * Reads the most recent message that contains the >>> AGREEMENT:
 * marker and returns the substring after the marker. Falls back to
 * the conversation summary if no marker is present.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, summary")
    .eq("id", params.id)
    .single();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conv.participant_a !== user.id &&
    conv.participant_b !== user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Walk the messages newest-first looking for the agreement marker.
  // Capped at last 30 — agreements are always near the end.
  const { data: msgs } = await service
    .from("messages")
    .select("final_text, sent_at, sender_user_id")
    .eq("conversation_id", params.id)
    .order("sent_at", { ascending: false })
    .limit(30);

  let agreement: string | null = null;
  for (const m of ((msgs ?? []) as any[])) {
    const text = (m.final_text ?? "").toString();
    const marker = text.match(/>>>\s*AGREEMENT:?\s*/i);
    if (marker) {
      agreement = text.slice(marker.index! + marker[0].length).trim();
      break;
    }
  }

  return NextResponse.json({
    agreement_text: agreement,
    summary: (conv as any).summary ?? null
  });
}
