import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { connectionBlocked } from "@/lib/user-safety";

/**
 * Pre-draft endpoint — returns the text the requesting user's twin
 * WOULD say next, without committing it as a real message. Lets the
 * PersistentCompose textarea pre-fill with the twin's suggestion so
 * the user reviews / edits before tapping send.
 *
 * Auth: must be a participant. The draft is anchored to the
 * requesting user's twin profile (goals, deal_preferences, comm style,
 * ai_export_blob) — so the suggestion sounds like THEM, not a generic
 * negotiator.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const conversationId = body.conversation_id;
  if (!conversationId) {
    return NextResponse.json(
      { error: "missing_conversation_id" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b, goal_override")
    .eq("id", conversationId)
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

  const otherId =
    conv.participant_a === user.id ? conv.participant_b : conv.participant_a;
  if (await connectionBlocked(user.id, otherId)) {
    return NextResponse.json({ error: "This connection is blocked." }, { status: 403 });
  }

  // Pull both twins + the message history. Twin profile of the
  // requesting user anchors the voice; counterpart twin gives Claude
  // the negotiation context.
  const [{ data: selfTwin }, { data: otherTwin }, { data: selfProfile }, { data: otherProfile }, { data: msgs }] =
    await Promise.all([
      service
        .from("twin_profiles")
        .select("goals, deal_preferences, communication_style, deal_breakers, ai_export_blob")
        .eq("user_id", user.id)
        .maybeSingle(),
      service
        .from("twin_profiles")
        .select("goals, deal_preferences, communication_style, deal_breakers, ai_export_blob")
        .eq("user_id", otherId)
        .maybeSingle(),
      service
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle(),
      service
        .from("profiles")
        .select("display_name, email")
        .eq("id", otherId)
        .maybeSingle(),
      service
        .from("messages")
        .select("sender_user_id, final_text, sent_at")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true })
    ]);

  const selfName =
    (selfProfile as any)?.display_name ||
    (selfProfile as any)?.email ||
    "you";
  const otherName =
    (otherProfile as any)?.display_name ||
    (otherProfile as any)?.email ||
    "the other person";

  const transcript = ((msgs ?? []) as any[])
    .slice(-20)
    .map((m) => {
      const who = m.sender_user_id === user.id ? selfName : otherName;
      return `${who}: ${m.final_text}`;
    })
    .join("\n");

  const selfBlock = `
${selfName}'s goals: ${(selfTwin as any)?.goals || "(not specified)"}
${selfName}'s deal preferences: ${(selfTwin as any)?.deal_preferences || "(not specified)"}
${selfName}'s comm style: ${(selfTwin as any)?.communication_style || "(not specified)"}
${selfName}'s deal breakers: ${(selfTwin as any)?.deal_breakers || "(not specified)"}
${selfName}'s context blob (excerpts):
${((selfTwin as any)?.ai_export_blob || "").slice(0, 1500)}
  `.trim();

  const otherBlock = `
${otherName}'s goals: ${(otherTwin as any)?.goals || "(not specified)"}
${otherName}'s deal preferences: ${(otherTwin as any)?.deal_preferences || "(not specified)"}
${otherName}'s comm style: ${(otherTwin as any)?.communication_style || "(not specified)"}
  `.trim();

  const systemPrompt = `You are drafting the NEXT message ${selfName} should send to ${otherName} in an ongoing conversation. The draft will be shown in a text input so ${selfName} can edit before sending.

Specific goal for THIS conversation (takes priority over general profile interests): ${conv.goal_override?.trim() || "Use the shared goals in the profiles."}
Honor every exclusion in that goal. Never invent availability, meeting durations, assets, or promises to send materials. Unknown details are questions for the humans, not accepted commitments.

Hard rules:
- Write in ${selfName}'s voice. Match their communication style and tone.
- 2-4 sentences max. No emojis, no em-dashes, no markdown.
- Move the conversation forward — react to the last message, ask a concrete question, or propose a next step.
- Don't roleplay as the other person. Don't include "${selfName}:" prefix.
- Return ONLY the message body. No commentary, no explanation.`;

  const userContent = `--- ${selfName}'s twin profile ---
${selfBlock}

--- ${otherName}'s twin profile ---
${otherBlock}

--- conversation so far (most recent 20 messages) ---
${transcript || "(no messages yet)"}

--- task ---
Draft ${selfName}'s next message. Just the body, nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    return NextResponse.json({ text });
  } catch (e: any) {
    console.error("[draft-next] generation failed", e);
    return NextResponse.json(
      { error: "generation_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
