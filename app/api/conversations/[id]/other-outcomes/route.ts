import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Generate ALTERNATE win-win outcomes for a conversation (#10 —
 * "Top Outcome + View Other Outcomes").
 *
 * The conversation already has one proposed outcome (conversations.summary).
 * This reads the full transcript + that current outcome and asks the model
 * for 2-3 DISTINCT alternative win-wins the two parties could land on
 * instead — different structures, not reworded versions of the same deal.
 * The user can then preview them and promote one to the live proposal via
 * /api/conversations/[id]/change-proposal.
 */
const AGREEMENT_MARKER = ">>> AGREEMENT:";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const conversationId = params.id;
  const service = createServiceClient();

  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, summary")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: msgs } = await service
    .from("messages")
    .select("sender_user_id, final_text, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .limit(80);

  const transcript = ((msgs ?? []) as any[])
    .map((m) => {
      const who = m.sender_user_id === user.id ? "You" : "Them";
      const text = String(m.final_text ?? "")
        .replace(new RegExp(`${AGREEMENT_MARKER}.*$`, "s"), "")
        .trim();
      return text ? `${who}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);

  const currentOutcome = (conv.summary ?? "").trim();

  if (!transcript && !currentOutcome) {
    return NextResponse.json({ outcomes: [] });
  }

  const system = `You are a deal architect. Two people's AI twins have been negotiating. You're given the transcript and the CURRENT proposed outcome. Propose 2-3 genuinely DIFFERENT alternative win-win outcomes they could reach instead — not reworded versions of the current one. Each must be concrete, specific, and balanced (a real win for both sides), and grounded in what the transcript shows they each want.

Return ONLY this JSON, no markdown:
{
  "outcomes": [
    { "title": "<3-6 word handle for this path>", "text": "<1-3 sentence concrete proposal both could accept>" }
  ]
}

Rules:
- 2 to 3 outcomes. Each materially different in STRUCTURE (e.g. trade vs. partnership vs. intro-for-equity), not just wording.
- Specific and actionable — name the actual exchange, cadence, or terms implied by the transcript. No vague "explore synergies".
- Don't repeat the current outcome. Offer real alternatives.
- Return ONLY the JSON object.`;

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 900,
      system,
      messages: [
        {
          role: "user",
          content: `CURRENT proposed outcome:\n${currentOutcome || "(none yet)"}\n\nTRANSCRIPT:\n${transcript || "(no messages yet)"}\n\nReturn the JSON with alternative outcomes.`
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
    if (start === -1 || end === -1) {
      return NextResponse.json({ outcomes: [] });
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    const outcomes = Array.isArray(parsed?.outcomes)
      ? parsed.outcomes
          .filter((o: any) => o && typeof o.text === "string")
          .slice(0, 3)
          .map((o: any) => ({
            title: String(o.title ?? "Alternative").slice(0, 60),
            text: String(o.text).slice(0, 1000)
          }))
      : [];
    return NextResponse.json({ outcomes });
  } catch (e: any) {
    console.error("other-outcomes error", e);
    return NextResponse.json(
      { error: "generation_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
