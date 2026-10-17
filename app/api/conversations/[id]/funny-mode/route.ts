import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Toggle funny_mode on a conversation. Auth-gated to participants.
 *
 * GET → returns current value.
 * POST { funny_mode: boolean } → updates + returns new value.
 *
 * Rewritten without the discriminated-union helper because TS strict
 * was inferring an overly-broad return type that broke property
 * access on the success branch. Plain inline guards now — verbose
 * but explicit.
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
    .select("id, participant_a, participant_b, funny_mode")
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
  return NextResponse.json({
    funny_mode: ((conv as any).funny_mode as boolean | null) ?? false
  });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
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
    .select("id, participant_a, participant_b")
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

  let body: { funny_mode?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const next = !!body.funny_mode;

  try {
    const { error } = await service
      .from("conversations")
      .update({ funny_mode: next })
      .eq("id", params.id);
    if (error) {
      return NextResponse.json(
        { error: "update_failed", detail: error.message },
        { status: 500 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "update_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
  return NextResponse.json({ funny_mode: next });
}
