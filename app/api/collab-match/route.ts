import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Win-win matcher (Jack's "Your Potential Collaboration").
 *
 * Takes the signed-in viewer's twin + a target member's twin and surfaces
 * the invisible, concrete collaboration the two could explore. On-demand
 * (button-triggered) so the conference/community page stays fast — we
 * don't run an LLM for every member on load.
 *
 * POST { target_user_id } → { collaboration }
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { target_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const targetId = String(body.target_user_id || "").trim();
  if (!targetId) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: "self" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: twins } = await service
    .from("twin_profiles")
    .select("user_id, goals, deal_preferences, ai_export_blob")
    .in("user_id", [user.id, targetId]);
  const byId = new Map((twins ?? []).map((t: any) => [t.user_id, t]));
  const me = byId.get(user.id) ?? {};
  const them = byId.get(targetId) ?? {};

  const { data: profs } = await service
    .from("profiles")
    .select("id, display_name")
    .in("id", [user.id, targetId]);
  const nameById = new Map(
    (profs ?? []).map((p: any) => [p.id, p.display_name as string | null])
  );
  const myName = (nameById.get(user.id) as string) || "You";
  const theirName = (nameById.get(targetId) as string) || "they";

  const ctx = (t: any, max = 2500) =>
    [t.goals, t.deal_preferences, t.ai_export_blob]
      .filter(Boolean)
      .join("\n")
      .slice(0, max);

  const myCtx = ctx(me);
  const theirCtx = ctx(them);
  if (!myCtx.trim()) {
    return NextResponse.json({
      collaboration:
        "Add more to your own twin (goals + what you're looking for) so it can find the win-win here."
    });
  }
  if (!theirCtx.trim()) {
    return NextResponse.json({
      collaboration: `${theirName}'s twin is still thin — once they add context, the win-win will surface here.`
    });
  }

  const system = `You find the SPECIFIC, non-obvious win-win between two people based on their twin context. Output 2-3 sentences, second person ("You and ${theirName}..."). Sentence 1-2: the concrete exchange, what each side uniquely GIVES and GETS, grounded in evidence from both contexts (cite the actual project, number, or need). Final sentence: "First step:" followed by one action either person can take this week in under 30 minutes (a specific intro, a 20-minute call about X, sending the deck). No vague "explore synergies", no invented facts, NEVER use em-dashes (use commas or periods). If the overlap is thin, name the single most promising angle anyway. Return ONLY the sentences, no preamble.`;

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 220,
      system,
      messages: [
        {
          role: "user",
          content: `YOU (${myName}):\n${myCtx}\n\nTHEM (${theirName}):\n${theirCtx}\n\nThe win-win:`
        }
      ]
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    return NextResponse.json({
      collaboration: text || "No clear win-win surfaced yet — try again as both twins grow."
    });
  } catch (e: any) {
    console.error("collab-match error", e);
    return NextResponse.json(
      { error: "match_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
