import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Chat-continuation invite (#166). Upload an iMsg/WhatsApp/Telegram/SMS
 * export, model the OTHER person from their messages, generate "where
 * it goes next."
 *
 * The pitch: you've been DMing with someone for weeks. Where would the
 * conversation organically land? SyncedIn models both sides and plays
 * the next 8-10 messages — then you can share the result with them as
 * a "look where we're headed, want to make this real?" invite.
 *
 * POST FormData { file, your_name? } — text/plain chat export only for MVP
 *   → { participants, you_name, other_name, continuation: [{role, body}] }
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_INPUT_CHARS = 60_000; // ~15k tokens of raw chat text

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw = "";
  let yourName = "";
  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      yourName = String(form.get("your_name") ?? "").trim();
      if (file && file instanceof File) {
        raw = await file.text();
      } else {
        // Allow a raw `text` form field as a fallback (paste-not-upload).
        raw = String(form.get("text") ?? "");
      }
    } else {
      const j = await req.json();
      raw = String(j?.text ?? "");
      yourName = String(j?.your_name ?? "").trim();
    }
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  raw = (raw ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  if (raw.length > MAX_INPUT_CHARS) {
    // Keep the most-recent slice — older context is less useful for
    // continuation. Save a leading marker so the model knows it's a tail.
    raw =
      "[…earlier portion of the conversation omitted for length…]\n\n" +
      raw.slice(raw.length - MAX_INPUT_CHARS);
  }

  // Best-effort format hint detection. We don't strictly parse — we let
  // Claude figure out the participants from the raw text. Detection just
  // helps the prompt set expectations.
  let format = "unknown";
  if (/^\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s/m.test(raw)) format = "whatsapp";
  else if (
    /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?\s/m.test(raw)
  )
    format = "imessage_csv";
  else if (/"text"\s*:\s*"/.test(raw) && /"from"\s*:\s*"/.test(raw))
    format = "telegram_json";
  else if (/^From:\s/m.test(raw) || /^Me:|^You:/m.test(raw)) format = "sms";

  const system = `You are analyzing a real chat-message export. Your job:
1. Identify the two participants by name. One is "you" (the human asking) — they ${
    yourName ? `said their name is "${yourName}"` : "did NOT specify their name; infer it"
  }. The other is the counterpart.
2. Model the counterpart from how they actually write — their cadence, slang, references, what they care about, what they don't engage with.
3. Generate the next 8–10 messages of how this conversation would PLAUSIBLY continue based on the trajectory of the existing thread. Alternate speakers naturally; don't force every turn. End on a moment that genuinely advances the relationship (an ask, a plan, a confession, a vulnerable moment) — not a polite close.

Format your reply EXACTLY as:
PARTICIPANTS: <your_name> <-> <other_name>
---
<your_name>: <message>
<other_name>: <message>
<your_name>: <message>
...

No commentary, no analysis, no headers beyond what's specified. Just the participant line + the messages.

Chat format detected: ${format}.`;

  try {
    const resp = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 2000,
      system,
      messages: [
        {
          role: "user",
          content: `Here is the conversation export:\n\n${raw}`
        }
      ]
    });
    const text = resp.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    // Parse the model's output back into a structured shape.
    const parsed = parseContinuation(text);
    return NextResponse.json({
      ok: true,
      format,
      ...parsed,
      raw_text: text
    });
  } catch (e: any) {
    console.error("[chat-continuation] gen failed", e);
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: e?.message ?? "Couldn't reach Claude."
      },
      { status: 500 }
    );
  }
}

function parseContinuation(text: string): {
  you_name: string | null;
  other_name: string | null;
  continuation: Array<{ speaker: string; body: string }>;
} {
  // PARTICIPANTS line.
  const partLine = text.match(/^PARTICIPANTS:\s*(.+?)\s*<->\s*(.+?)\s*$/im);
  const youName = partLine ? partLine[1].trim() : null;
  const otherName = partLine ? partLine[2].trim() : null;

  // Strip the participants line + the `---` separator from the body.
  const body = text
    .replace(/^PARTICIPANTS:.*$/im, "")
    .replace(/^---+\s*$/m, "")
    .trim();

  // Each line is `Speaker: body` — but messages can wrap. Use a
  // forgiving pattern that splits on a known-speaker prefix when we
  // recognize one; otherwise rolls into the prior message.
  const out: Array<{ speaker: string; body: string }> = [];
  const speakerPrefix = /^([A-Za-z][\w .'-]{0,30}):\s+(.*)$/;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(speakerPrefix);
    if (m) {
      out.push({ speaker: m[1].trim(), body: m[2].trim() });
    } else if (line.trim() && out.length > 0) {
      out[out.length - 1].body += "\n" + line.trim();
    }
  }
  return { you_name: youName, other_name: otherName, continuation: out };
}
