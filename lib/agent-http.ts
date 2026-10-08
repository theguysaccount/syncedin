import { AgentError } from "@/lib/agent-service";

export async function readAgentJson(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AgentError(415, "Send application/json.");
  if (Number(req.headers.get("content-length") || 0) > 20000)
    throw new AgentError(413, "This request is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new AgentError(400, "Send valid JSON.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) throw new AgentError(413, "This request is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AgentError(400, "Send valid JSON.");
  }
}
