import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Quick-join preview matcher. A logged-OUT visitor pastes who they are
 * (about / wants / offers / links / optional AI dump) on a room page;
 * this matches that context against the room's members and returns the
 * top win-wins INSTANTLY — the value that pulls them to sign up (Jack:
 * "show you the value of who it connects you with right away … then
 * 'view full messages' pushes people to sign up").
 *
 * No auth, no writes — purely a read + LLM preview. POST:
 *   { context }  (free-text the visitor pasted/typed)
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  let body: { context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const visitor = (body.context ?? "").toString().trim().slice(0, 6000);
  if (visitor.length < 12) {
    return NextResponse.json({
      matches: [],
      note: "Add a little more about yourself to see your matches."
    });
  }

  const slug = (params.slug || "").toLowerCase();
  const service = createServiceClient();

  const { data: memberRows } = await service
    .from("conference_members")
    .select("user_id")
    .eq("conference_slug", slug);
  const ids = (memberRows ?? []).map((r: any) => r.user_id);
  if (ids.length === 0) {
    return NextResponse.json({ matches: [], note: "No members to match yet." });
  }

  const { data: profs } = await service
    .from("profiles")
    .select("id, display_name, email")
    .in("id", ids);
  const nameById = new Map(
    (profs ?? []).map((p: any) => [p.id, p.display_name || p.email || "A member"])
  );
  let twins: any[] = [];
  {
    const full = await service
      .from("twin_profiles")
      .select("user_id, goals, deal_preferences, ai_export_blob")
      .in("user_id", ids);
    twins = full.error
      ? (await service.from("twin_profiles").select("user_id, goals").in("user_id", ids))
          .data ?? []
      : full.data ?? [];
  }
  const members = twins
    .map((t: any) => {
      const ctx = [t.goals, t.deal_preferences, t.ai_export_blob]
        .filter(Boolean)
        .join(" ")
        .slice(0, 1200);
      return { name: nameById.get(t.user_id) as string, ctx };
    })
    .filter((m) => m.ctx.trim().length > 10)
    .slice(0, 12);

  if (members.length === 0) {
    return NextResponse.json({
      matches: [],
      note: "Members are still building their twins — check back soon."
    });
  }

  const system = `A visitor to a networking room pasted who they are. Given their context and the room's members, pick the 2-3 members with the strongest concrete win-win and, for each, write ONE specific sentence on what they'd explore together. Return ONLY JSON: {"matches":[{"name":"<member name exactly as given>","winwin":"<one concrete sentence>"}]}. No member with zero overlap. No preamble.`;

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 500,
      system,
      messages: [
        {
          role: "user",
          content: `VISITOR:\n${visitor}\n\nMEMBERS:\n${members
            .map((m, i) => `${i + 1}. ${m.name}: ${m.ctx}`)
            .join("\n")}\n\nReturn the JSON.`
        }
      ]
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed =
      start !== -1 && end !== -1 ? JSON.parse(text.slice(start, end + 1)) : {};
    const matches = Array.isArray(parsed?.matches)
      ? parsed.matches
          .filter((m: any) => m && m.name && m.winwin)
          .slice(0, 3)
          .map((m: any) => ({
            name: String(m.name).slice(0, 80),
            winwin: String(m.winwin).slice(0, 300)
          }))
      : [];
    return NextResponse.json({ matches });
  } catch (e: any) {
    console.error("preview-match error", e);
    return NextResponse.json({ matches: [], error: "match_failed" });
  }
}
