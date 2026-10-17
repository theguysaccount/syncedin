import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Mark a conversation as read up to NOW for the calling user. Drives
 * the WhatsApp-style ✓ delivered / ✓✓ read indicators on outgoing
 * bubbles. ChatUI calls this on mount + after every new message is
 * appended on the client side.
 *
 * No body — derives "which participant am I?" from auth.uid().
 */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const conversation_id = params.id;
  if (!conversation_id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("participant_a, participant_b")
    .eq("id", conversation_id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const col =
    conv.participant_a === user.id ? "last_read_a" : "last_read_b";
  const { error } = await service
    .from("conversations")
    .update({ [col]: new Date().toISOString() })
    .eq("id", conversation_id);
  if (error) {
    return NextResponse.json(
      { error: "update_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
