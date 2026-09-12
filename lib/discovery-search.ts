import type { ExaPerson } from "./exa";

export type SearchScope = "local" | "global";
export type DiscoveryOptions = { scope: SearchScope; location: string };

export function discoveryOptions(
  body: Record<string, unknown>,
  twin?: { current_city?: string | null; hometown?: string | null } | null,
  fallback: SearchScope = "global"
): DiscoveryOptions {
  const scope = body.search_scope === "local" || body.search_scope === "global" ? body.search_scope : fallback;
  const entered = typeof body.search_location === "string" ? body.search_location.trim() : "";
  return { scope, location: scope === "local" ? (entered || twin?.current_city?.trim() || twin?.hometown?.trim() || "").slice(0, 120) : "" };
}

export function discoveryQuery(query: string, options: DiscoveryOptions, reason = ""): string {
  return [query, reason.trim() ? `Connection purpose: ${reason.trim().slice(0, 1000)}` : "",
    options.scope === "local" && options.location ? `Based in or near ${options.location}` : ""].filter(Boolean).join(". ");
}

function cityKey(value: string): string {
  return value.split(",")[0].normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesCity(city: string | null | undefined, location: string): boolean {
  const a = cityKey(city || "");
  const b = cityKey(location);
  return !!a && !!b && (a === b || a.startsWith(b + " ") || b.startsWith(a + " "));
}

export function rankDiscoveryPeople(people: ExaPerson[], options: DiscoveryOptions): ExaPerson[] {
  if (options.scope === "global" || !options.location) return people;
  const city = cityKey(options.location);
  return people.map((person, index) => ({
    person, index,
    local: ` ${cityKey([person.title, ...person.highlights].join(" ").replace(/,/g, " "))} `.includes(` ${city} `) ? 1 : 0
  })).sort((a, b) => b.local - a.local || a.index - b.index).map(({ person }) => person);
}

export function discoveryCacheKey(userId: string, options: DiscoveryOptions, reason: string): string {
  return `syncedin.findPeople.v2:${JSON.stringify([userId, options.scope, options.scope === "local" ? options.location.trim().toLowerCase() : "", reason.trim()])}`;
}

export function discoveryScopePrompt(options: DiscoveryOptions): string {
  return options.scope === "local"
    ? `Search scope: LOCAL. Find relevant people based in or near ${JSON.stringify(options.location)}. Keep intellectual and topic fit strong within this area. Do not use the sender's other past locations. Include this city in each search query.`
    : "Search scope: GLOBAL. Prioritize intellectual compatibility: shared ideas, substantive research, complementary expertise, and the specific connection purpose. Search worldwide. Do not add geographic restrictions or favor proximity based on the sender's hometown, current city, or locations mentioned in their biography. Include a location only if the user's explicit search intent requires it. Favor substantive work over popularity or fame.";
}
