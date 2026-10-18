import "server-only";

import { normalizePhoneNumber } from "@/lib/phone";

type ClawService = "iMessage" | "RCS" | "SMS" | string;

type ClawSendResult = {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  status?: string;
  outcomeUnknown?: boolean;
  error?: string;
};

const DEFAULT_SERVER_URL = "https://claw-messenger.onrender.com";

function config() {
  return {
    apiKey: process.env.CLAW_MESSENGER_API_KEY || "",
    serverUrl: process.env.CLAW_MESSENGER_SERVER_URL || DEFAULT_SERVER_URL,
    preferredService: process.env.CLAW_MESSENGER_PREFERRED_SERVICE || undefined
  };
}

function clawHttpUrl(serverUrl: string, path: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol === "ws:") url.protocol = "http:";
  url.pathname = path;
  url.search = "";
  return url.toString();
}

export function clawMessengerConfigured(): boolean {
  return !!config().apiKey;
}

export async function registerClawRoute(
  rawPhone: string | null | undefined
): Promise<ClawSendResult> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone) return { ok: false, skipped: true, error: "invalid_phone" };

  const { apiKey, serverUrl } = config();
  if (!apiKey) return { ok: false, skipped: true, error: "missing_api_key" };

  try {
    const res = await fetch(clawHttpUrl(serverUrl, "/api/routes"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ phone_number: phone }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `route registration failed (${res.status})`
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "route registration unavailable" };
  }
}

export async function sendClawMessage(args: {
  to: string | null | undefined;
  text: string;
  service?: ClawService;
  timeoutMs?: number;
}): Promise<ClawSendResult> {
  const phone = normalizePhoneNumber(args.to);
  const text = args.text.trim();
  if (!phone) return { ok: false, skipped: true, error: "invalid_phone" };
  if (!text) return { ok: true, skipped: true };

  const { apiKey, serverUrl, preferredService } = config();
  if (!apiKey) return { ok: false, skipped: true, error: "missing_api_key" };

  const service = args.service || preferredService;
  try {
    // HTTPS sends do not require a persistent listener in a serverless function.
    // Never retry here: a lost response may follow an accepted send.
    const res = await fetch(clawHttpUrl(serverUrl, "/api/agent/send-message"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ phone_number: phone, text, ...(service ? { service } : {}) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(args.timeoutMs ?? 30_000)
    });
    if (!res.ok) return { ok: false, error: `claw send rejected (${res.status})` };

    const data: unknown = await res.json();
    if (!data || typeof data !== "object") {
      return { ok: false, outcomeUnknown: true, error: "claw returned an invalid send response" };
    }
    const result = data as { ok?: unknown; status?: unknown; message_id?: unknown; messageId?: unknown };
    const messageId = result.message_id ?? result.messageId;
    if (result.ok === false || result.status === "failed") {
      return { ok: false, error: "claw send rejected" };
    }
    if (result.ok !== true || typeof messageId !== "string" || !messageId ||
      typeof result.status !== "string" ||
      !["accepted", "not_confirmed", "sent", "delivered", "read"].includes(result.status)) {
      return { ok: false, outcomeUnknown: true, error: "claw send was not confirmed" };
    }
    // Acceptance is not a delivery receipt or proof that replies reach SyncedIn.
    return { ok: true, messageId, status: result.status };
  } catch {
    return { ok: false, outcomeUnknown: true, error: "claw send response unavailable" };
  }
}
