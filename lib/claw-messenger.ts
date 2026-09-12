import "server-only";

import { normalizePhoneNumber } from "@/lib/phone";

type ClawService = "iMessage" | "RCS" | "SMS" | string;

type ClawSendResult = {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
  raw?: unknown;
};

const DEFAULT_SERVER_URL = "wss://claw-messenger.onrender.com";
const DEFAULT_SERVICE = "iMessage";

function config() {
  return {
    apiKey: process.env.CLAW_MESSENGER_API_KEY || "",
    serverUrl: process.env.CLAW_MESSENGER_SERVER_URL || DEFAULT_SERVER_URL,
    preferredService:
      process.env.CLAW_MESSENGER_PREFERRED_SERVICE || DEFAULT_SERVICE
  };
}

function clawHttpUrl(serverUrl: string, path: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "ws:" || url.protocol === "wss:" ? "https:" : url.protocol;
  url.pathname = path;
  url.search = "";
  return url.toString();
}

function clawWsUrl(serverUrl: string, apiKey: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  if (!url.protocol || url.protocol === ":") url.protocol = "wss:";
  if (!url.pathname.endsWith("/ws")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
  }
  url.searchParams.set("key", apiKey);
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
      body: JSON.stringify({ phone_number: phone })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `route registration failed: ${res.status} ${detail}`.trim()
      };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "route registration failed" };
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

  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    return { ok: false, error: "WebSocket is not available in this runtime" };
  }

  const id = `send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {
    id,
    type: "send",
    service: args.service || preferredService,
    to: phone,
    parts: [{ type: "text", value: text }]
  };

  return await new Promise<ClawSendResult>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish({ ok: false, error: "claw send timed out" });
    }, args.timeoutMs ?? 30_000);
    const ws = new WebSocketCtor(clawWsUrl(serverUrl, apiKey));

    function finish(result: ClawSendResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      resolve(result);
    }

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(payload));
    });

    ws.addEventListener("message", (event) => {
      let data: any;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (data?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (data?.id !== id) return;
      if (data.ok) {
        finish({
          ok: true,
          messageId: data.messageId ? String(data.messageId) : undefined,
          raw: data
        });
      } else {
        finish({
          ok: false,
          error: String(data?.error || "send rejected"),
          raw: data
        });
      }
    });

    ws.addEventListener("error", () => {
      finish({ ok: false, error: "claw websocket error" });
    });

    ws.addEventListener("close", () => {
      finish({ ok: false, error: "claw websocket closed before response" });
    });
  });
}
