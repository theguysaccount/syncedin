import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL, withAnthropicRetry } from "@/lib/anthropic";
import { AGREEMENT_MARKER, hasAgreement, scrubAiTells } from "@/lib/twin-prompt";
import { connectionBlocked } from "@/lib/user-safety";
import { contentSafetyResponse } from "@/lib/content-safety";
import { conversationStreamResponse } from "@/lib/conversation-stream";
import { CONVERSATION_TOOL, ConversationMessageDecoder } from "@/lib/conversation-json";
import type { Message, Profile, TwinProfile } from "@/lib/types";
import { loadBlendedAiExports } from "@/lib/ai-exports";

/**
 * Closed-doors negotiation (Jack's architecture): the humans should not
 * watch two twins type verbose discovery at each other. Instead, the
 * twins exchange FULL context privately in one pass, find the
 * highest-purpose win-win, pressure-test it, and only then emit a SHORT
 * human-facing exchange (4-6 tight messages) that ends with the
 * >>> AGREEMENT contract line. The chat the humans see is the distilled
 * result, not the negotiation process.
 *
 * Scope: FRESH conversations only (zero messages). Mid-flight
 * conversations keep the classic turn-by-turn loop, and the client
 * falls back to that loop if this route fails for any reason.
 *
 * POST { conversation_id } → { messages: Message[], done: true }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function clip(s: string | null | undefined, n: number): string {
  const v = (s ?? "").trim();
  return v.length > n ? `${v.slice(0, n)}\n[...trimmed...]` : v;
}

function dossier(label: string, p: Profile, t: TwinProfile, blob: string) {
  return `=== ${label}: ${p.display_name || p.email || "Unknown"} ===
GOALS:
${clip(t.goals, 1500) || "(none provided)"}

WHAT THEY WANT FROM A COUNTERPART (deal preferences):
${clip(t.deal_preferences, 1200) || "(none provided)"}

COMMUNICATION STYLE:
${clip(t.communication_style, 600) || "(none provided)"}

DEAL-BREAKERS (hard constraints, never violate):
${clip(t.deal_breakers, 800) || "(none provided)"}

FULL PERSONAL CONTEXT DUMP:
${clip(blob, 6000) || "(none provided)"}`;
}

export async function POST(req: Request) {
  const wantsStream = req.headers.get("accept")?.includes("text/event-stream");
  const supabase = createClient();
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
  const conversation_id = body.conversation_id;
  if (!conversation_id) {
    return NextResponse.json(
      { error: "missing_conversation_id" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: conv } = await service
    .from("conversations")
    .select("*")
    .eq("id", conversation_id)
    .single();
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conv.participant_a !== user.id && conv.participant_b !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (await connectionBlocked(conv.participant_a, conv.participant_b)) {
    return NextResponse.json({ error: "This connection is blocked." }, { status: 403 });
  }

  // Fresh conversations only. Anything already in flight belongs to the
  // turn-by-turn loop.
  const { count: existingCount, error: countError } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation_id);
  if (countError) return NextResponse.json({ error: "Conversation could not be loaded." }, { status: 503 });
  if ((existingCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "not_fresh", detail: "Conversation already has messages." },
      { status: 409 }
    );
  }

  const aId = conv.participant_a as string;
  const bId = conv.participant_b as string;
  const [
    { data: aProfile },
    { data: aTwin },
    { data: bProfile },
    { data: bTwin }
  ] = await Promise.all([
    service.from("profiles").select("*").eq("id", aId).single(),
    service.from("twin_profiles").select("*").eq("user_id", aId).maybeSingle(),
    service.from("profiles").select("*").eq("id", bId).single(),
    service.from("twin_profiles").select("*").eq("user_id", bId).maybeSingle()
  ]);
  if (!aProfile || !bProfile) {
    return NextResponse.json({ error: "profiles_missing" }, { status: 400 });
  }
  if (!aTwin || !bTwin) {
    const missing = !aTwin
      ? (aProfile as Profile).display_name || "A participant"
      : (bProfile as Profile).display_name || "A participant";
    return NextResponse.json(
      {
        error: "twin_not_set_up",
        detail: `${missing} hasn't finished building their twin yet — the conversation can't run until they do.`
      },
      { status: 400 }
    );
  }

  // Both sides get their FULL blended dossier — this is the
  // context-to-context share that happens behind closed doors.
  const [aBlob, bBlob] = await Promise.all([
    loadBlendedAiExports(aId, (aTwin as TwinProfile).ai_export_blob ?? null),
    loadBlendedAiExports(bId, (bTwin as TwinProfile).ai_export_blob ?? null)
  ]);

  const aName =
    (aProfile as Profile).display_name ||
    (aProfile as Profile).email ||
    "Person A";
  const bName =
    (bProfile as Profile).display_name ||
    (bProfile as Profile).email ||
    "Person B";

  const system = `You are running a PRIVATE closed-doors negotiation between two people's AI twins, then distilling it for the humans.

PHASE 1 (private reasoning, never shown): With the FULL context from both sides, find the single HIGHEST-PURPOSE win-win between ${aName} and ${bName}: the concrete exchange with the most mutual value given their actual goals, offers, constraints, and deal-breakers. Pressure-test it. If the obvious idea violates a deal-breaker or timeline, take the next-best angle. Decide who does what, by when, on what channel.

PHASE 2 (your entire output): The distilled human-facing exchange ONLY. 4 to 6 messages alternating between the twins, each 1-2 sentences, zero filler, no discovery theater, no "I saw your profile" preamble. Message 1 is from ${aName}'s twin and opens INSIDE the alignment: name the specific overlap and the proposed exchange immediately. Subsequent messages sharpen terms, surface the one real constraint, and resolve it. The FINAL message must end with a line that begins exactly "${AGREEMENT_MARKER}" followed by 1-3 plain-prose sentences stating the concrete final destination: who does what, by when, on what channel. The agreement line is a contract: no markdown, no emojis, no links.

Hard rules: never invent facts absent from the contexts. NEVER use em-dashes anywhere, use commas or periods. Each message must contain information the humans need, not process narration.

${wantsStream
    ? 'Return the entire exchange through the write_exchange tool. Supply its messages array in chronological order, alternating sender a and b. Do not emit the exchange as ordinary text.'
    : 'Return ONLY this JSON, no markdown fences:\n{"messages":[{"sender":"a","text":"..."},{"sender":"b","text":"..."}]}'} `;

  const userContent = `${dossier("PERSON A", aProfile as Profile, aTwin as TwinProfile, aBlob ?? "")}

${dossier("PERSON B", bProfile as Profile, bTwin as TwinProfile, bBlob ?? "")}

Run the closed-doors negotiation and return the JSON now.`;

  if (wantsStream) {
    return conversationStreamResponse(async (send, signal) => {
      const inserted: Message[] = [];
      try {
        await withAnthropicRetry(async () => {
          const decoder = new ConversationMessageDecoder();
          const stream = anthropic.messages.stream({
            model: TWIN_MODEL, max_tokens: 1500, system,
            tools: [CONVERSATION_TOOL],
            tool_choice: { type: "tool", name: CONVERSATION_TOOL.name },
            messages: [{ role: "user", content: userContent }]
          }, { signal, timeout: 90_000, maxRetries: 0 });
          async function save(records: Array<{ text: string }>) {
            for (const record of records) {
              signal.throwIfAborted();
              if (inserted.length >= 6) throw new Error("Too many conversation messages.");
              const text = scrubAiTells(record.text.trim()).slice(0, 1200);
              const sender = inserted.length % 2 === 0 ? aId : bId;
              const safety = await contentSafetyResponse(text, sender);
              if (safety) throw new Error((await safety.json()).error);
              signal.throwIfAborted();
              if (await connectionBlocked(aId, bId)) throw new Error("This connection is blocked.");
              const { data: row, error } = await service.from("messages").insert({
                conversation_id, sender_user_id: sender,
                original_draft: text, final_text: text, edited: false,
                sent_at: new Date().toISOString()
              }).select("*").single();
              if (error || !row) throw new Error("Your next message could not be saved. Please continue to try again.");
              inserted.push(row as Message);
              send({ type: "message", message: row as Message });
            }
          }
          try {
            let toolIndex: number | null = null;
            for await (const event of stream) {
              if (event.type === "content_block_start" && event.content_block.type === "tool_use" && event.content_block.name === CONVERSATION_TOOL.name) {
                if (toolIndex !== null) throw new Error("Invalid conversation response.");
                toolIndex = event.index;
              }
              if (event.type === "content_block_delta" && event.index === toolIndex && event.delta.type === "input_json_delta") {
                await save(decoder.push(event.delta.partial_json));
              }
            }
            if (toolIndex === null) throw new Error("Invalid conversation response.");
            await save(decoder.push("", true));
          } catch (error) {
            // Never retry a partially saved exchange: continuing uses the saved transcript.
            if (inserted.length) throw new Error("The exchange stopped early. Your saved messages are safe. Please continue to try again.");
            throw error;
          } finally { stream.abort(); }
        }, { label: "closed-doors-stream", retries: 2 });
        if (inserted.length < 3) throw new Error("The exchange stopped early. Please continue to try again.");
        send({ type: "done", done: hasAgreement(inserted[inserted.length - 1].final_text), next_turn_user_id: null });
      } catch (error) {
        if (!signal.aborted) send({ type: "error", detail: error instanceof Error ? error.message : "The exchange could not be completed. Please try again." });
      }
    }, req.signal);
  }

  let text = "";
  try {
    const response = await withAnthropicRetry(
      () =>
        anthropic.messages.create({
          model: TWIN_MODEL,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: userContent }]
        }),
      { label: "closed-doors" }
    );
    text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: e?.friendlyMessage ?? e?.message ?? String(e)
      },
      { status: 503 }
    );
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return NextResponse.json({ error: "parse_failed" }, { status: 500 });
  }
  let parsed: { messages?: Array<{ sender?: string; text?: string }> };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return NextResponse.json({ error: "parse_failed" }, { status: 500 });
  }
  const raw = Array.isArray(parsed.messages) ? parsed.messages : [];
  const cleaned = raw
    .map((m, i) => ({
      // Enforce alternation starting from A regardless of model drift.
      sender: i % 2 === 0 ? aId : bId,
      text: scrubAiTells(String(m?.text ?? "").trim()).slice(0, 1200)
    }))
    .filter((m) => m.text.length > 0)
    .slice(0, 6);
  if (cleaned.length < 3) {
    return NextResponse.json({ error: "too_thin" }, { status: 500 });
  }
  const safety = await contentSafetyResponse(cleaned.map(message => message.text).join("\n\n"), user.id);
  if (safety) return safety;
  if (await connectionBlocked(aId, bId)) return NextResponse.json({ error: "This connection is blocked." }, { status: 403 });

  // Insert sequentially with spaced timestamps so ordering is stable.
  const base = Date.now() - cleaned.length * 1500;
  const inserted: Message[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const { data: row, error } = await service
      .from("messages")
      .insert({
        conversation_id,
        sender_user_id: cleaned[i].sender,
        original_draft: cleaned[i].text,
        final_text: cleaned[i].text,
        edited: false,
        sent_at: new Date(base + i * 1500).toISOString()
      })
      .select("*")
      .single();
    if (error || !row) {
      console.error("closed-doors insert failed", error);
      return NextResponse.json(
        { error: "insert_failed", detail: error?.message },
        { status: 500 }
      );
    }
    inserted.push(row as Message);
  }

  return NextResponse.json({ messages: inserted, done: true });
}
