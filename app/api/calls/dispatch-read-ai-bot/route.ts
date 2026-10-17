import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Send a Read AI recording bot to a Zoom / Google Meet / Microsoft Teams
 * meeting attached to a SyncedIn call. The bot joins the meeting, records,
 * transcribes, and produces a structured summary that we can later fetch +
 * append to BOTH participants' twin context.
 *
 * Body: { call_id, meeting_url }
 *
 * READ_AI_API_KEY env var must be set to actually dispatch the bot.
 * Without it, this route returns a friendly "configure the env var
 * first" message + still stamps the meeting URL on the calls row so
 * the manual transcript flow keeps working.
 *
 * Read AI API docs (the call we're making): POST to
 * https://api.read.ai/v1/meetings/create_agent with
 *   { meeting_url, meeting_platform?, meeting_id?, meeting_password? }
 *   Authorization: Bearer <READ_AI_API_KEY>
 *
 * Platform is auto-detected from the URL host:
 *   zoom.us       → "zoom"
 *   meet.google.com → "meet"
 *   teams.microsoft.com → "teams"
 */
const READ_AI_API_KEY = process.env.READ_AI_API_KEY;

function detectPlatform(url: string): string | null {
  const u = url.toLowerCase();
  if (/zoom\.us/.test(u)) return "zoom";
  if (/meet\.google\.com/.test(u)) return "meet";
  if (/teams\.microsoft\.com|teams\.live\.com/.test(u)) return "teams";
  return null;
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { call_id?: string; meeting_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const call_id = (body.call_id ?? "").trim();
  const meeting_url = (body.meeting_url ?? "").trim();
  if (!call_id || !meeting_url) {
    return NextResponse.json(
      { error: "missing_fields", detail: "call_id + meeting_url required" },
      { status: 400 }
    );
  }
  const platform = detectPlatform(meeting_url);
  if (!platform) {
    return NextResponse.json(
      {
        error: "unsupported_platform",
        detail:
          "Read AI only supports Zoom, Google Meet, or Microsoft Teams URLs. Paste one of those instead."
      },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: call } = await service
    .from("calls")
    .select("id, conversation_id")
    .eq("id", call_id)
    .maybeSingle();
  if (!call) {
    return NextResponse.json({ error: "call_not_found" }, { status: 404 });
  }
  const { data: conv } = await service
    .from("conversations")
    .select("id, participant_a, participant_b")
    .eq("id", call.conversation_id)
    .maybeSingle();
  if (
    !conv ||
    (conv.participant_a !== user.id && conv.participant_b !== user.id)
  ) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }

  // Stamp the meeting URL + platform regardless of whether the bot
  // actually dispatched — the user might still prefer the manual
  // transcript paste flow on /api/calls/end.
  await service
    .from("calls")
    .update({ external_meeting_url: meeting_url, external_platform: platform })
    .eq("id", call_id);

  if (!READ_AI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "read_ai_not_configured",
        detail:
          "Meeting URL saved. To auto-record this call, set READ_AI_API_KEY in your Vercel env (get one at https://read.ai/settings/api). Until then, paste the transcript at the end of the call using the panel in the call modal."
      },
      { status: 200 }
    );
  }

  // Dispatch the read.ai bot via their REST API. The exact endpoint +
  // payload shape may need to be tuned against their current docs;
  // we wrap in try/catch and surface the response so any drift is
  // visible in the UI instead of silently failing.
  try {
    const res = await fetch(
      "https://api.read.ai/v1/meetings/create_agent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${READ_AI_API_KEY}`
        },
        body: JSON.stringify({
          meeting_url,
          meeting_platform: platform
        })
      }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "read_ai_dispatch_failed",
          detail:
            (j as any).message ||
            (j as any).error ||
            `HTTP ${res.status} from read.ai`
        },
        { status: 502 }
      );
    }
    const readAiMeetingId =
      (j as any).meeting_id ||
      (j as any).id ||
      (j as any).read_ai_meeting_id ||
      null;
    if (readAiMeetingId) {
      await service
        .from("calls")
        .update({ read_ai_meeting_id: String(readAiMeetingId) })
        .eq("id", call_id);
    }
    return NextResponse.json({
      ok: true,
      read_ai_meeting_id: readAiMeetingId,
      platform
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "read_ai_network",
        detail: e?.message ?? String(e)
      },
      { status: 502 }
    );
  }
}
