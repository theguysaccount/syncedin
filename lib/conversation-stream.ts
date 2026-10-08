import type { Message } from "./types";

export type ConversationEvent =
  | { type: "status" }
  | { type: "message"; message: Message }
  | { type: "done"; done: boolean; next_turn_user_id?: string | null }
  | { type: "error"; detail: string };

/** A synchronous lock also covers clicks before React renders the busy state. */
export function createConversationRunGuard() {
  let current: AbortController | null = null;
  return {
    begin() {
      if (current) return null;
      current = new AbortController();
      return current;
    },
    end(controller: AbortController) {
      if (current === controller) current = null;
    },
    abort() { current?.abort(); current = null; },
    get active() { return current !== null; }
  };
}

/** Model output is JSON Lines: parse complete records, never a partial JSON string. */
export class ConversationLineDecoder {
  private pending = "";
  push(delta: string, final = false): Array<{ text: string }> {
    this.pending += delta;
    if (this.pending.length > 32_000) throw new Error("Invalid conversation response.");
    const lines = this.pending.split("\n");
    this.pending = final ? "" : lines.pop()!;
    return lines.filter(line => line.trim()).map(line => {
      const value = JSON.parse(line);
      if (!value || typeof value.text !== "string" || !value.text.trim()) {
        throw new Error("Invalid conversation message.");
      }
      return { text: value.text };
    });
  }
}

export function conversationStreamResponse(
  produce: (send: (event: ConversationEvent) => void, signal: AbortSignal) => Promise<void>,
  requestSignal: AbortSignal
): Response {
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  if (requestSignal.aborted) abort.abort();
  requestSignal.addEventListener("abort", onAbort, { once: true });
  const encoder = new TextEncoder();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ConversationEvent) => {
        if (!closed && !abort.signal.aborted) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        send({ type: "status" });
        await produce(send, abort.signal);
      } catch {
        send({ type: "error", detail: "The connection was interrupted. Your saved messages are safe. Please continue to try again." });
      } finally {
        requestSignal.removeEventListener("abort", onAbort);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; abort.abort(); }
  });
  return new Response(body, { headers: {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "private, no-store, no-transform",
    "x-accel-buffering": "no"
  } });
}

/** Accept legacy JSON during deployment, but require a terminal event for streams. */
export async function readConversationEvents(
  response: Response,
  onEvent: (event: ConversationEvent) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const result = await response.json();
    signal.throwIfAborted();
    for (const message of result.messages ?? (result.message ? [result.message] : [])) onEvent({ type: "message", message });
    onEvent({ type: "done", done: !!result.done, next_turn_user_id: result.next_turn_user_id });
    return;
  }
  if (!response.body) throw new Error("The conversation response was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let terminal = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  function process(final = false) {
    const frames = pending.split(/\r?\n\r?\n/);
    pending = final ? "" : frames.pop()!;
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!data) continue;
      const event: ConversationEvent = JSON.parse(data);
      if (event.type === "error") throw new Error(event.detail);
      if (event.type === "done") terminal = true;
      if (event.type !== "status" && event.type !== "message" && event.type !== "done") throw new Error("Invalid conversation event.");
      onEvent(event);
    }
  }
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) { pending += decoder.decode(); process(true); break; }
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 128_000) throw new Error("Invalid conversation response.");
      process();
    }
    if (!terminal) throw new Error("The connection was interrupted. Your saved messages are safe. Please continue to try again.");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
