import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exaPeopleSearch, type ExaPerson } from "@/lib/exa";
import { discoveryOptions, discoveryQuery, matchesCity, rankDiscoveryPeople } from "@/lib/discovery-search";

/**
 * Find a person to start a conversation with — by name OR email.
 *
 * Returns two lists:
 *   sync_users  – matches inside SyncedIn (clickable → start convo)
 *   exa_people  – suggestions from the open web (clickable → invite + draft)
 *
 * If the query looks like an email, we do an exact email lookup first and
 * skip Exa (no point — we know who they are).
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
  if (!query) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const service = createServiceClient();
  const isEmail = query.includes("@") && query.includes(".");
  // Keep the existing new-conversation finder local unless it explicitly opts out.
  let options = discoveryOptions(body, null, "local");
  if (!isEmail && options.scope === "local" && !options.location) {
    const { data: twin } = await service.from("twin_profiles").select("hometown,current_city").eq("user_id", user.id).maybeSingle();
    options = discoveryOptions(body, twin, "local");
  }
  if (!isEmail && body.search_scope === "local" && !options.location) {
    return NextResponse.json({ error: "missing_location", detail: "Enter a city for a local search." }, { status: 400 });
  }

  // ── SyncedIn search ────────────────────────────────────────────────
  type SyncUser = {
    id: string;
    display_name: string | null;
    email: string | null;
  };
  let sync_users: SyncUser[] = [];

  if (isEmail) {
    const { data } = await service
      .from("profiles")
      .select("id, display_name, email")
      .eq("email", query.toLowerCase())
      .limit(5);
    sync_users = (data ?? []) as SyncUser[];
  } else {
    // Match by display_name OR email containing the query, exclude self.
    const { data } = await service
      .from("profiles")
      .select("id, display_name, email")
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
      .neq("id", user.id)
      .limit(8);
    sync_users = (data ?? []) as SyncUser[];
  }

  if (!isEmail && body.search_scope === "local" && options.location && sync_users.length) {
    const { data: twins } = await service.from("twin_profiles").select("user_id,current_city,hometown").in("user_id", sync_users.map((person) => person.id));
    const localIds = new Set((twins || []).filter((twin) => matchesCity(twin.current_city || twin.hometown, options.location)).map((twin) => twin.user_id));
    sync_users = sync_users.filter((person) => localIds.has(person.id));
  }

  // ── Exa fallback for context / discovery ────────────────────────────
  let exa_people: ExaPerson[] = [];
  if (!isEmail) {
    try {
      const reason = typeof body.connection_reason === "string" ? body.connection_reason : "";
      const people = await exaPeopleSearch(discoveryQuery(query, options, reason), 20);
      exa_people = rankDiscoveryPeople(people, options).slice(0, 15);
    } catch (e) {
      // Non-fatal — Exa is a "nice to have" here.
      console.error("exa lookup in find-counterpart failed", e);
    }
  }

  return NextResponse.json({ sync_users, exa_people, search_scope: options.scope, search_location: options.location });
}
