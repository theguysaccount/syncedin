import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  AgentError,
  agentOwner,
  authorizeAgent,
  draftAgentIntroduction,
  enrollmentStatus,
  findAgentMatches,
  hashAgentToken,
  prepareAgentEnrollment,
  readAgentProfile,
} from "@/lib/agent-service";
import { agentProfileSchema } from "@/lib/agent-profile";
import { normalizePhoneNumber } from "@/lib/phone";
import { contentSafetyResponse } from "@/lib/content-safety";
import { readAgentJson } from "@/lib/agent-http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const uuid = z.uuid();
const ticketSchema = z.string().regex(/^sir_[a-f0-9]{64}$/);
const bearer = (req: Request) =>
  req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
async function handle(
  req: Request,
  { params }: { params: { path: string[] } },
) {
  try {
    const path = params.path.join("/");
    const db = createServiceClient();
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin)
      throw new AgentError(403, "Use the same site for browser actions.");
    if (req.method === "GET") {
      if (path === "me") {
        const grant = await authorizeAgent(bearer(req));
        return json(await readAgentProfile(grant.userId));
      }
      if (path === "matches") {
        const grant = await authorizeAgent(bearer(req));
        return json(await findAgentMatches(grant.userId));
      }
      if (path === "access") {
        const user = await agentOwner();
        const grants = await db
          .from("agent_enrollments")
          .select(
            "id,agent_name,status,agent_enabled,approved_at,grant_expires_at,revoked_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        const drafts = await db
          .from("agent_introduction_drafts")
          .select(
            "id,text,counterpart_id,created_at,counterpart:profiles!agent_introduction_drafts_counterpart_id_fkey(display_name,handle)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (grants.error || drafts.error)
          throw new AgentError(503, "Agent access could not be loaded.");
        return json({ grants: grants.data, drafts: drafts.data });
      }
      throw new AgentError(404, "Unknown agent endpoint.");
    }
    const data = await readAgentJson(req);
    if (path === "enrollments")
      return json(
        await prepareAgentEnrollment(
          data,
          req.headers.get("x-real-ip") || "unknown",
        ),
        201,
      );
    const status = path.match(/^enrollments\/([^/]+)\/status$/);
    if (status)
      return json(
        await enrollmentStatus(
          uuid.parse(status[1]),
          bearer(req) || z.string().parse(data.agentToken),
        ),
      );
    if (path === "preview") {
      const input = z
        .object({ id: uuid, ticket: ticketSchema })
        .strict()
        .parse(data);
      const row = await db
        .from("agent_enrollments")
        .select("id,agent_name,profile,context,expires_at,status")
        .eq("id", input.id)
        .eq("review_hash", hashAgentToken(input.ticket))
        .gt("expires_at", new Date().toISOString())
        .eq("status", "pending")
        .maybeSingle();
      if (row.error)
        throw new AgentError(503, "Your draft could not be loaded.");
      if (!row.data)
        throw new AgentError(
          404,
          "This private draft has expired or already been reviewed.",
        );
      return json(row.data);
    }
    if (path === "introductions") {
      const input = z
        .object({
          counterpart_id: uuid,
          text: z.string().trim().min(1).max(300),
        })
        .strict()
        .parse(data);
      const grant = await authorizeAgent(bearer(req));
      return json(
        await draftAgentIntroduction(grant, input.counterpart_id, input.text),
        201,
      );
    }
    if (!origin)
      throw new AgentError(
        403,
        "A browser origin is required for account decisions.",
      );
    const user = await agentOwner();
    if (path === "approve") {
      const input = z
        .object({
          id: uuid,
          ticket: ticketSchema,
          profile: agentProfileSchema,
          phone_number: z.string().max(40),
          native_app: z.boolean().optional(),
          grant_agent_access: z.boolean(),
          confirmed_profile: z.literal(true),
        })
        .strict()
        .parse(data);
      const phone = normalizePhoneNumber(input.phone_number);
      if (!phone && (input.phone_number.trim() || !input.native_app))
        throw new AgentError(
          400,
          "Add a valid private phone number before saving your twin.",
        );
      const safety = await contentSafetyResponse(
        Object.values(input.profile).join("\n"),
        user.id,
      );
      if (safety) return safety;
      const saved = await db.rpc("approve_agent_enrollment", {
        p_id: input.id,
        p_review_hash: hashAgentToken(input.ticket),
        p_user_id: user.id,
        p_profile: input.profile,
        p_phone: phone,
        p_agent_enabled: input.grant_agent_access,
      });
      if (saved.error)
        throw new AgentError(
          saved.error.code === "P0001" ? 409 : 503,
          saved.error.code === "P0001"
            ? saved.error.message
            : "Your profile could not be saved. Nothing has been approved.",
        );
      return json({
        status: "approved",
        agentActive: input.grant_agent_access,
        next: "/twin?welcome=1",
      });
    }
    if (path === "revoke") {
      const input = z.object({ id: uuid }).strict().parse(data);
      const row = await db
        .from("agent_enrollments")
        .update({ agent_enabled: false, revoked_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (row.error)
        throw new AgentError(503, "Agent access could not be revoked.");
      if (!row.data) throw new AgentError(404, "Agent access not found.");
      return json({ status: "revoked" });
    }
    throw new AgentError(404, "Unknown agent endpoint.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: "Check the profile fields.",
          details: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 5),
        },
        400,
      );
    return json(
      {
        error:
          error instanceof AgentError
            ? error.message
            : "Agent setup is temporarily unavailable.",
      },
      error instanceof AgentError ? error.status : 503,
    );
  }
}
export { handle as GET, handle as POST };
