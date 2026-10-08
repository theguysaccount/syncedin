import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "Control characters are not allowed.",
    );
export const agentProfileSchema = z
  .object({
    display_name: text(80).min(2),
    goals: text(2000).min(10),
    deal_preferences: text(2000).optional(),
    communication_style: text(800).optional(),
    deal_breakers: text(1000).optional(),
    current_city: text(120).optional(),
    achievements: text(1600).optional(),
    ai_export_blob: text(6000).optional(),
  })
  .strict();
export type AgentProfile = z.infer<typeof agentProfileSchema>;
const contribution = z
  .object({ tag: text(40), description: text(360).min(3) })
  .strict();
const syncbookProfile = z
  .object({
    name: text(80).min(2),
    headline: text(140).optional(),
    about: text(1200).optional(),
    location: text(120).optional(),
    offers: z.array(contribution).min(1).max(8),
    needs: z.array(contribution).min(1).max(8),
    intentions: z.array(text(100)).max(6).optional(),
    availability: text(60).optional(),
    links: z.array(z.url().max(300)).max(3).optional(),
    agentName: text(60).optional(),
    visibility: z.enum(["public", "unlisted"]).optional(),
  })
  .strict();
export const enrollmentSchema = z
  .object({
    agent_name: text(60).min(1).default("My agent"),
    profile: z.union([agentProfileSchema, syncbookProfile]),
    context: z
      .object({
        sourceLabels: z.array(text(80)).max(6).optional(),
        inferredFields: z.array(text(80)).max(10).optional(),
        note: text(400).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export function normalizeAgentEnrollment(input: unknown) {
  const value = enrollmentSchema.parse(input);
  const p = value.profile;
  const profile: AgentProfile =
    "display_name" in p
      ? p
      : {
          display_name: p.name,
          goals: [
            ...p.needs.map((n) => n.description),
            ...(p.intentions ?? []),
          ].join("\n"),
          deal_preferences: p.offers.map((o) => o.description).join("\n"),
          ...(p.location ? { current_city: p.location } : {}),
          ai_export_blob: [
            p.headline,
            p.about,
            p.availability ? `Availability: ${p.availability}` : "",
            ...(p.links ?? []),
          ]
            .filter(Boolean)
            .join("\n"),
        };
  return {
    agent_name:
      "agentName" in p && p.agentName ? p.agentName : value.agent_name,
    profile: agentProfileSchema.parse(profile),
    context: value.context ?? {},
  };
}
export const AGENT_SCOPES = [
  "read_profile",
  "find_matches",
  "draft_introductions",
] as const;
export function activeAgentGrant(
  row: {
    status: string;
    agent_enabled: boolean;
    revoked_at: string | null;
    grant_expires_at: string | null;
    user_id: string | null;
  },
  now = Date.now(),
) {
  return (
    row.status === "approved" &&
    row.agent_enabled &&
    !row.revoked_at &&
    !!row.user_id &&
    !!row.grant_expires_at &&
    Date.parse(row.grant_expires_at) > now
  );
}
