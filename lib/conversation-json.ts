import { JSONParser } from "@streamparser/json";

/** Emit each complete message from structured tool input, even across token boundaries. */
export class ConversationMessageDecoder {
  private parser = new JSONParser({ paths: ["$.messages.*"], keepStack: false });
  private ready: Array<{ text: string }> = [];
  private length = 0;
  constructor() {
    this.parser.onValue = ({ value }) => {
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.text !== "string" || !value.text.trim()) {
        throw new Error("Invalid conversation message.");
      }
      this.ready.push({ text: value.text });
    };
  }
  push(delta: string, final = false): Array<{ text: string }> {
    this.length += delta.length;
    if (this.length > 32_000) throw new Error("Invalid conversation response.");
    if (delta) this.parser.write(delta);
    if (final && !this.parser.isEnded) this.parser.end();
    return this.ready.splice(0);
  }
}

export const CONVERSATION_TOOL = {
  name: "write_exchange",
  eager_input_streaming: true,
  description: "Write the distilled conversation, alternating sender a and b, with a concrete agreement in the final message.",
  input_schema: {
    type: "object" as const,
    properties: { messages: {
      type: "array", minItems: 3, maxItems: 6,
      items: { type: "object", properties: {
        sender: { type: "string", enum: ["a", "b"] },
        text: { type: "string" }
      }, required: ["sender", "text"], additionalProperties: false }
    } },
    required: ["messages"], additionalProperties: false
  }
};
