import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import {
  TWIN_TOOLS,
  runTwinTool,
  type PendingAction
} from "@/lib/twin-tools";

/**
 * Talk-to-your-twin chat (#159). A single 1:1 thread per user where
 * the user converses with their own digital twin to:
 *   - get triage on pending proposals
 *   - think out loud about goals
 *   - refine the twin's voice (the twin learns from the convo as it
 *     goes via the existing edit-delta pattern — TBD)
 *
 * GET   → returns the user's full thread (chronological, max 200)
 * POST  { body } → appends user message, calls Claude, persists +
 *                  returns the assistant reply
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_HISTORY_FOR_PROMPT = 30;

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
    const { data, error } = await service
      .from("twin_chat_messages")
      .select("id, role, body, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch (e: any) {
    // If schema not yet migrated, surface the friendly hint so the UI
    // can prompt Jack to run the SQL block.
    if (/relation .* does not exist|schema cache/i.test(e?.message ?? "")) {
      return NextResponse.json(
        {
          messages: [],
          _err: "schema_missing",
          _detail:
            "Run the twin_chat_messages migration in Supabase → SQL Editor."
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ messages: [], _err: e?.message ?? null });
  }
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const userText = (body.body ?? "").trim();
  if (!userText) {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }
  if (userText.length > 4000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const service = createServiceClient();

  // Pull the user's twin profile so the assistant can speak in their
  // voice. Soft-fail: if twin isn't fully built yet we still respond,
  // just with a thinner system prompt.
  const [{ data: profile }, { data: twin }] = await Promise.all([
    service
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("twin_profiles")
      .select(
        "goals, deal_preferences, communication_style, deal_breakers, ai_export_blob, hometown, current_city"
      )
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  // Pull pending proposals so the twin can give specific triage when
  // asked. Pending = conversation has summary but no agreement_response
  // from this user. Limit to 5 most recent to keep context cheap.
  let proposalContext = "";
  try {
    const { data: convs } = await service
      .from("conversations")
      .select(
        "id, participant_a, participant_b, summary, counterpart_summary, created_at"
      )
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .not("summary", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    const convIds = (convs ?? []).map((c: any) => c.id);
    if (convIds.length) {
      const { data: resps } = await service
        .from("agreement_responses")
        .select("conversation_id")
        .eq("user_id", user.id)
        .in("conversation_id", convIds);
      const respondedSet = new Set(
        (resps ?? []).map((r: any) => r.conversation_id)
      );
      const pending = (convs ?? [])
        .filter((c: any) => !respondedSet.has(c.id))
        .slice(0, 5);
      if (pending.length) {
        proposalContext =
          "\n\n# Pending proposals waiting on the user:\n" +
          pending
            .map(
              (p: any, i: number) =>
                `${i + 1}. ${(p.counterpart_summary ?? "Counterpart").slice(
                  0,
                  120
                )} — proposal: ${(p.summary ?? "").slice(0, 200)}`
            )
            .join("\n");
      }
    }
  } catch {
    /* non-fatal */
  }

  // Load recent thread for context (last 30 turns).
  const { data: priorRows } = await service
    .from("twin_chat_messages")
    .select("role, body, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_FOR_PROMPT);
  const priorMessages = ((priorRows ?? []) as any[])
    .reverse()
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.body as string
    }));

  // Persist the new user turn BEFORE generating so a crash mid-gen
  // doesn't lose the user's input.
  const { data: userMsg } = await service
    .from("twin_chat_messages")
    .insert({ user_id: user.id, role: "user", body: userText })
    .select("id")
    .single();

  const selfName =
    (profile as any)?.display_name ||
    ((profile as any)?.email as string)?.split("@")[0] ||
    "you";

  const system = `You are ${selfName}'s digital twin. They are talking to you directly — this is NOT a twin-to-twin networking conversation. They came here to think out loud with you, get advice on pending proposals, or refine your voice.

You know them intimately:
- Goals: ${(twin as any)?.goals || "(not set yet)"}
- Deal preferences: ${(twin as any)?.deal_preferences || "(not set)"}
- Communication style: ${(twin as any)?.communication_style || "(not set)"}
- Deal-breakers: ${(twin as any)?.deal_breakers || "(not set)"}
- Hometown / current city: ${(twin as any)?.hometown || "?"} → ${
    (twin as any)?.current_city || "?"
  }

Speak in first-person as their twin, but stay aware that you ARE the AI and they ARE the human. Be candid. Push back when their thinking is off. Offer specific moves they can take next. Keep replies under 200 words unless they explicitly ask for more depth.

# YOUR TOOLS
You have 7 tools — read tools run immediately, write tools generate Approve cards the user taps to confirm:

READ (auto-execute, you get the data back):
- list_pending_proposals() — every proposal waiting on the user
- list_recent_conversations() — last 10 active threads
- search_platform_users(query) — find people on the platform

WRITE (return an inline Approve card, NO DB writes happen unless the user taps Approve):
- update_proposal_text(conversation_id, counterpart_name, new_text)
- accept_proposal(conversation_id, counterpart_name)
- deny_proposal(conversation_id, counterpart_name, reason)
- send_message_to_conversation(conversation_id, counterpart_name, text)

# RULES
- When the user asks "what proposals do I have", "who's waiting on me", "triage my inbox" — call list_pending_proposals FIRST, then summarize.
- When they ask to update / accept / deny / send — call list_pending_proposals or list_recent_conversations FIRST to get real conversation_ids, then call the appropriate write tool. NEVER invent a conversation_id.
- Write tools stage actions. After calling one, tell the user briefly what you've staged — e.g. "Staged an update to the Jacob proposal — tap Approve below to ship it." Do NOT claim the action is done. The user's tap is what writes to the DB.
- If they ask to do something across multiple proposals ("update all 5"), call the write tool ONCE per conversation — every action gets its own Approve card.
- For drafts: write the new text in plain prose (contract-style for agreements, the user's voice for messages). No emoji clusters, no markdown images.
${proposalContext}`;

  try {
    // Multi-turn tool-use loop: model calls tools → we run them →
    // feed results back → model emits final text. Capped at TURN_CAP
    // so a runaway tool-call loop can't burn tokens forever.
    const TURN_CAP = 6;
    let conversationTurns: any[] = [
      ...priorMessages,
      { role: "user" as const, content: userText }
    ];
    let finalText = "";
    const pendingActions: PendingAction[] = [];

    for (let i = 0; i < TURN_CAP; i++) {
      const resp = await anthropic.messages.create({
        model: TWIN_MODEL,
        max_tokens: 1200,
        system,
        tools: TWIN_TOOLS as any,
        messages: conversationTurns
      });

      const textChunks = resp.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      if (textChunks.trim()) finalText = textChunks;

      const toolUses = resp.content.filter(
        (c: any) => c.type === "tool_use"
      ) as any[];

      if (toolUses.length === 0) {
        break; // pure text response — done
      }

      conversationTurns.push({ role: "assistant", content: resp.content });

      const toolResultBlocks: any[] = [];
      for (const tu of toolUses) {
        const { data, pending_action } = await runTwinTool(
          service as any,
          user.id,
          tu.name,
          tu.input || {}
        );
        if (pending_action) pendingActions.push(pending_action);
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(data).slice(0, 6000)
        });
      }
      conversationTurns.push({ role: "user", content: toolResultBlocks });
    }

    const out = finalText.trim() || "(no reply)";

    // Persist the assistant message. Stash pending_actions in the body
    // as a trailing JSON marker so they survive reload (the client
    // parses + strips them before rendering).
    const persistBody =
      pendingActions.length > 0
        ? `${out}\n\n<!--PENDING_ACTIONS:${JSON.stringify(pendingActions)}-->`
        : out;

    const { data: asstMsg } = await service
      .from("twin_chat_messages")
      .insert({ user_id: user.id, role: "assistant", body: persistBody })
      .select("id, created_at")
      .single();

    return NextResponse.json({
      ok: true,
      user_message_id: (userMsg as any)?.id ?? null,
      assistant: {
        id: (asstMsg as any)?.id ?? null,
        role: "assistant",
        body: out,
        created_at: (asstMsg as any)?.created_at ?? null
      },
      pending_actions: pendingActions
    });
  } catch (e: any) {
    console.error("[twin/chat] generation failed", e);
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: e?.message ?? "Couldn't reach Claude."
      },
      { status: 500 }
    );
  }
}
