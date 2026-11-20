const EVENTS = new Set([
  "view", "prompt_copied", "decode_started", "decode_done", "decode_failed",
  "claim_clicked", "share_clicked", "generate_started", "generate_done",
  "people_chip_clicked", "ghost_prefill_used", "win_published"
]);
const PUBLIC_PATHS = new Set(["/", "/talk", "/ai-knows-me", "/generate-free-portfolio", "/wins"]);
const DOORS = new Set(["landing", "ai-knows-me", "generate-free-portfolio", "wins", "invite-lockin"]);

export function validFunnelId(value: unknown): value is string {
  return typeof value === "string" && (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) || /^[a-z0-9]{18,32}$/.test(value));
}

export function funnelCollectionAllowed(url: string, privacy: { doNotTrack?: string | null; globalPrivacyControl?: boolean; automated?: boolean } = {}): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://syncedin.org" && !parsed.searchParams.has("qa") && !parsed.searchParams.has("preview") &&
      privacy.doNotTrack !== "1" && !privacy.globalPrivacyControl && !privacy.automated;
  } catch {
    return false;
  }
}

export function sanitizeFunnelEvent(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (typeof body.event !== "string" || !EVENTS.has(body.event) || typeof body.path !== "string") return null;
  const supplied = body.meta && typeof body.meta === "object" && !Array.isArray(body.meta) ? body.meta as Record<string, unknown> : {};
  let path: string;
  if (PUBLIC_PATHS.has(body.path) && !["ghost_prefill_used", "win_published"].includes(body.event)) path = body.path;
  else if (body.event === "ghost_prefill_used" && body.path === "/ghosts") path = "/ghosts";
  else if (body.event === "win_published" && body.path === "/messages") path = "/messages";
  else if (body.event === "claim_clicked" && supplied.door === "invite-lockin") path = "/[invite]";
  else return null;
  const meta: Record<string, string | number | boolean> = {};
  if (typeof supplied.door === "string" && DOORS.has(supplied.door)) meta.door = supplied.door;
  for (const [key, maximum] of [["chars", 8000], ["people", 100], ["needs", 100]] as const) {
    const value = supplied[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum) meta[key] = value;
  }
  if (body.event === "win_published" && typeof supplied.anonymize === "boolean") meta.anonymize = supplied.anonymize;
  return { event: body.event, path, anon_id: validFunnelId(body.anon) ? body.anon : null, meta: Object.keys(meta).length ? meta : null };
}
