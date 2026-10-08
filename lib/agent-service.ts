import { createHash, randomBytes } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  activeAgentGrant,
  normalizeAgentEnrollment,
  AGENT_SCOPES,
} from "@/lib/agent-profile";
import { hiddenUserIds } from "@/lib/user-safety";
import { computePairScore } from "@/lib/pair-score";
import { contentSafetyResponse } from "@/lib/content-safety";

export const hashAgentToken = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export class AgentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const agentOrigin = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "https://syncedin.org").replace(
    /\/$/,
    "",
  );
const check = (error: unknown) => {
  if (error)
    throw new AgentError(
      503,
      "Agent setup is temporarily unavailable. Please try again.",
    );
};
export async function prepareAgentEnrollment(input: unknown, ip: string) {
  const data = normalizeAgentEnrollment(input);
  const db = createServiceClient();
  const key = hashAgentToken(
    `${process.env.SUPABASE_SERVICE_ROLE_KEY}|signup|${ip}|${Math.floor(Date.now() / 600000)}`,
  );
  const rate = await db.rpc("agent_signup_rate", { p_key: key });
  check(rate.error);
  if (rate.data > 8)
    throw new AgentError(
      429,
      "Please wait ten minutes before preparing another profile.",
    );
  const agentToken = "sia_" + randomBytes(32).toString("hex");
  const ticket = "sir_" + randomBytes(32).toString("hex");
  const { data: row, error } = await db
    .from("agent_enrollments")
    .insert({
      ...data,
      token_hash: hashAgentToken(agentToken),
      review_hash: hashAgentToken(ticket),
    })
    .select("id,expires_at")
    .single();
  check(error);
  if (!row)
    throw new AgentError(503, "Your private draft could not be prepared.");
  return {
    enrollmentId: row.id,
    agentToken,
    verificationUrl: `${agentOrigin()}/agent/review?id=${row.id}#ticket=${ticket}`,
    expiresAt: row.expires_at,
    status: "pending",
    nextStep:
      "Give this private review link to your person. No account or twin has been changed. Keep the agent token private; it is inactive until the person signs in, reviews the draft, and grants access.",
  };
}
export async function enrollmentStatus(id: string, token: string) {
  if (!/^sia_[a-f0-9]{64}$/.test(token))
    throw new AgentError(401, "An agent token is required.");
  const { data: row, error } = await createServiceClient()
    .from("agent_enrollments")
    .select(
      "id,status,expires_at,user_id,agent_enabled,revoked_at,grant_expires_at",
    )
    .eq("id", id)
    .eq("token_hash", hashAgentToken(token))
    .maybeSingle();
  check(error);
  if (!row) throw new AgentError(404, "Draft not found.");
  return {
    status:
      row.status === "pending" && Date.parse(row.expires_at) <= Date.now()
        ? "expired"
        : row.status,
    agentActive: activeAgentGrant(row),
    expiresAt: row.expires_at,
    agentExpiresAt: row.grant_expires_at,
    memberId: row.user_id,
    scopes: activeAgentGrant(row) ? AGENT_SCOPES : [],
  };
}
export async function authorizeAgent(token: string) {
  if (!/^sia_[a-f0-9]{64}$/.test(token))
    throw new AgentError(401, "An approved agent token is required.");
  const { data: row, error } = await createServiceClient()
    .from("agent_enrollments")
    .select("id,status,user_id,agent_enabled,revoked_at,grant_expires_at")
    .eq("token_hash", hashAgentToken(token))
    .maybeSingle();
  check(error);
  if (!row || !activeAgentGrant(row))
    throw new AgentError(401, "Agent access is pending, expired, or revoked.");
  const { data: owner, error: ownerError } = await createServiceClient()
    .from("profiles")
    .select("is_suspended")
    .eq("id", row.user_id)
    .maybeSingle();
  check(ownerError);
  if (!owner || owner.is_suspended)
    throw new AgentError(403, "Account is unavailable.");
  return {
    id: row.id as string,
    userId: row.user_id as string,
    expiresAt: row.grant_expires_at as string,
    scopes: AGENT_SCOPES,
  };
}
export async function readAgentProfile(userId: string) {
  const db = createServiceClient();
  const profile = await db
    .from("profiles")
    .select("id,display_name,handle,portfolio_about")
    .eq("id", userId)
    .single();
  check(profile.error);
  const twin = await db
    .from("twin_profiles")
    .select(
      "goals,deal_preferences,communication_style,deal_breakers,current_city,achievements",
    )
    .eq("user_id", userId)
    .maybeSingle();
  check(twin.error);
  return { profile: profile.data, twin: twin.data, scopes: AGENT_SCOPES };
}
export async function findAgentMatches(userId: string) {
  const db = createServiceClient();
  const hidden = await hiddenUserIds(userId);
  const own = await db
    .from("twin_profiles")
    .select("goals,deal_preferences")
    .eq("user_id", userId)
    .maybeSingle();
  check(own.error);
  if (!own.data) return { matches: [] };
  const ownTwin = own.data;
  const people = await db
    .from("profiles")
    .select("id,display_name,handle,portfolio_about")
    .neq("id", userId)
    .eq("is_test_persona", false)
    .eq("is_suspended", false)
    .not("handle", "is", null)
    .limit(500);
  check(people.error);
  const profiles = (people.data ?? []).filter((p) => !hidden.has(p.id));
  if (!profiles.length) return { matches: [] };
  const twins = await db
    .from("twin_profiles")
    .select("user_id,goals,deal_preferences")
    .in(
      "user_id",
      profiles.map((p) => p.id),
    );
  check(twins.error);
  return {
    matches: profiles
      .map((p) => {
        const other = twins.data?.find((t) => t.user_id === p.id);
        return {
          id: p.id,
          name: p.display_name,
          about: p.portfolio_about,
          profileUrl: `${agentOrigin()}/u/${encodeURIComponent(p.handle!)}`,
          score: other ? computePairScore(ownTwin, other) : 0,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12),
  };
}
export async function draftAgentIntroduction(
  grant: { id: string; userId: string },
  counterpartId: string,
  text: string,
) {
  const hidden = await hiddenUserIds(grant.userId);
  if (hidden.has(counterpartId) || counterpartId === grant.userId)
    throw new AgentError(403, "This connection is unavailable.");
  const db = createServiceClient();
  const other = await db
    .from("profiles")
    .select("handle")
    .eq("id", counterpartId)
    .eq("is_test_persona", false)
    .eq("is_suspended", false)
    .maybeSingle();
  check(other.error);
  if (!other.data?.handle)
    throw new AgentError(404, "Public profile not found.");
  const rate = await db.rpc("agent_signup_rate", {
    p_key: hashAgentToken(
      `intro|${grant.id}|${Math.floor(Date.now() / 600000)}`,
    ),
  });
  check(rate.error);
  if (rate.data > 10)
    throw new AgentError(
      429,
      "Please wait ten minutes before drafting more introductions.",
    );
  const safety = await contentSafetyResponse(text, grant.userId);
  if (safety) throw new AgentError(safety.status, (await safety.json()).error);
  const { data, error } = await db.rpc("save_agent_introduction", {
    p_user_id: grant.userId,
    p_enrollment_id: grant.id,
    p_counterpart_id: counterpartId,
    p_text: text,
  });
  if (error)
    throw new AgentError(
      error.code === "P0001" ? 403 : 503,
      error.code === "P0001"
        ? error.message
        : "Your introduction could not be saved.",
    );
  if (!data) throw new AgentError(503, "Your introduction could not be saved.");
  return {
    id: data,
    status: "draft",
    sent: false,
    reviewUrl: `${agentOrigin()}/agents`,
  };
}
export async function agentOwner() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) throw new AgentError(401, "Sign in to review your profile.");
  return user;
}
