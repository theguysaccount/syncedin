import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Generate draft answers for the Refine step questions based on whatever
 * the user has already given us (goals + ai_export_blob + name + city).
 *
 * The user can then accept/edit each draft instead of staring at three
 * blank textareas. Aim for high-signal one-paragraph answers that read
 * like the user could have written them.
 *
 * The Refine fields target useful conversation seeds — not generic
 * networking small talk. We want answers that help two twins surface
 * win-wins faster:
 *   - asks         : what the user concretely wants from the network now
 *   - offers       : what they can give in return / what they're known for
 *   - non_negotiables: deal-breakers the twin should enforce
 *
 * Returns JSON: { asks, offers, non_negotiables, communication_style }.
 * The wizard maps these to the existing fields:
 *   asks            → goals (already filled, used only for cross-ref)
 *   offers          → deal_preferences  (what makes you say YES)
 *   communication_style → communication_style
 *   non_negotiables → deal_breakers
 */
export async function POST(req: Request) {
  const sb = (await createClient());
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    display_name?: string;
    goals?: string;
    ai_export_blob?: string;
    current_city?: string;
    hometown?: string;
    existing?: {
      deal_preferences?: string;
      communication_style?: string;
      deal_breakers?: string;
    };
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const name = (body.display_name || "").trim();
  const goals = (body.goals || "").trim();
  const blob = (body.ai_export_blob || "").trim();
  // Don't run for users with literally zero signal — would just
  // produce generic platitudes.
  if (!name && !goals && blob.length < 40) {
    return NextResponse.json({
      deal_preferences: "",
      communication_style: "",
      deal_breakers: ""
    });
  }

  const system = `You draft three specific, useful answers about a user based on context they've provided. Each answer is what THEY would say about themselves, in their voice. The user will edit, so prioritize concreteness over politeness.

Output STRICT JSON:
{
  "deal_preferences": "<2-3 sentences. The kinds of opportunities / people / conversations they'd say YES to instantly. Concrete patterns drawn from their goals or background. No vague filler.>",
  "communication_style": "<2-3 sentences. How they want to be approached, talked to, pushed back on. Length, tone, formality. If their goals mention building/shipping, lean direct. If they mention investing or strategy, lean considered.>",
  "deal_breakers": "<2-3 sentences. What makes them disengage. Specific behaviors, not abstract values. Pull from any signals in their background; if none, default to common-sense filters for their stated role.>"
}

Rules:
- First person, casual, 2-3 sentences each.
- NO em-dashes, NO markdown, NO emojis, NO hashtags.
- NEVER reference follower counts or audience size.
- If their existing draft for a field is non-empty, REFINE it rather than discard — keep their voice.
- Return ONLY the JSON, nothing else.`;

  const userContent = `User context:
Name: ${name || "(unspecified)"}
Current goals: ${goals || "(none stated)"}
Location: ${body.current_city || body.hometown || "(unspecified)"}
About-me / AI memory (raw): ${blob.slice(0, 2000) || "(none)"}

Existing drafts (if user already wrote something here, KEEP their voice):
- deal_preferences: ${body.existing?.deal_preferences || "(empty)"}
- communication_style: ${body.existing?.communication_style || "(empty)"}
- deal_breakers: ${body.existing?.deal_breakers || "(empty)"}

Return the JSON now.`;

  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: userContent }]
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({
        deal_preferences: "",
        communication_style: "",
        deal_breakers: ""
      });
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      deal_preferences?: string;
      communication_style?: string;
      deal_breakers?: string;
    };
    return NextResponse.json({
      deal_preferences: (parsed.deal_preferences || "").trim(),
      communication_style: (parsed.communication_style || "").trim(),
      deal_breakers: (parsed.deal_breakers || "").trim()
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        deal_preferences: "",
        communication_style: "",
        deal_breakers: "",
        error: String(e?.message ?? e)
      },
      { status: 200 }
    );
  }
}
