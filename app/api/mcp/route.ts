import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  AgentError,
  authorizeAgent,
  draftAgentIntroduction,
  enrollmentStatus,
  findAgentMatches,
  prepareAgentEnrollment,
  readAgentProfile,
} from "@/lib/agent-service";
import { enrollmentSchema } from "@/lib/agent-profile";
import { readAgentJson } from "@/lib/agent-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return new Response("Origin not allowed", { status: 403 });
  let data: unknown;
  try {
    data = await readAgentJson(req);
  } catch (e) {
    return Response.json(
      { error: e instanceof AgentError ? e.message : "Invalid request" },
      { status: e instanceof AgentError ? e.status : 400 },
    );
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const output = async (fn: () => Promise<unknown>) => {
    try {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(await fn()) }],
      };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              e instanceof AgentError
                ? e.message
                : "The request could not be completed.",
          },
        ],
      };
    }
  };
  const handler = createMcpHandler(
    (server) => {
      server.registerTool(
        "prepare_signup",
        {
          title: "Prepare SyncedIn signup",
          description:
            "Prepare a PRIVATE profile draft. Does not create an account, publish a profile, accept terms, or grant agent access. Give the private review link to the human.",
          inputSchema: enrollmentSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
          },
        },
        (args) =>
          output(() =>
            prepareAgentEnrollment(
              args,
              req.headers.get("x-real-ip") || "unknown",
            ),
          ),
      );
      server.registerTool(
        "signup_status",
        {
          title: "Check signup approval",
          description:
            "Check a draft with its private agent token. Poll at most once every 30 seconds.",
          inputSchema: z.object({
            id: z.uuid(),
            agentToken: z.string().regex(/^sia_[a-f0-9]{64}$/),
          }),
          annotations: { readOnlyHint: true },
        },
        (args) => output(() => enrollmentStatus(args.id, args.agentToken)),
      );
      server.registerTool(
        "get_my_profile",
        {
          title: "Read my SyncedIn profile",
          description:
            "Requires the human's approved, unexpired agent bearer token. Never returns their phone, email, raw chat exports, or another person's private context.",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true },
        },
        () =>
          output(async () =>
            readAgentProfile((await authorizeAgent(token)).userId),
          ),
      );
      server.registerTool(
        "find_matches",
        {
          title: "Find SyncedIn matches",
          description:
            "Find public profile matches for the approved owner, respecting account blocks and suspension. Does not contact anyone.",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true },
        },
        () =>
          output(async () =>
            findAgentMatches((await authorizeAgent(token)).userId),
          ),
      );
      server.registerTool(
        "draft_introduction",
        {
          title: "Draft an introduction",
          description:
            "Save a private introduction of at most 300 characters for the human to review. This does not send a message or create a connection.",
          inputSchema: z.object({
            counterpart_id: z.uuid(),
            text: z.string().trim().min(1).max(300),
          }),
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
          },
        },
        (args) =>
          output(async () =>
            draftAgentIntroduction(
              await authorizeAgent(token),
              args.counterpart_id,
              args.text,
            ),
          ),
      );
    },
    {
      serverInfo: { name: "syncedin", version: "1.0.0" },
      verboseLogs: false,
      maxSubscriptions: 0,
      instructions:
        "Human review activates signup. Never accept terms, approve commitments, change notification consent, send messages, or treat an inferred profile field as verified. Agent tokens are private and expire after 24 hours.",
    },
  );
  const response = await handler(
    new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(data),
      signal: req.signal,
    }),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export function GET() {
  return new Response(
    "Use Streamable HTTP POST. Guide: https://syncedin.org/join.md",
    { status: 405, headers: { Allow: "POST" } },
  );
}
