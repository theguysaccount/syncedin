import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import { exaPeopleSearch, type ExaPerson } from "@/lib/exa";
import type { Profile, TwinProfile } from "@/lib/types";
import { discoveryOptions, discoveryQuery, discoveryScopePrompt, rankDiscoveryPeople } from "@/lib/discovery-search";

/**
 * Twin-powered connection suggestions.
 *
 * Pipeline:
 *  1. Read the user's twin context (goals, deal preferences, etc.).
 *  2. Ask Claude to propose 3-4 search queries describing the kinds of people
 *     this user should connect with right now.
 *  3. Run each query through Exa in parallel.
 *  4. Merge + dedupe results and return grouped by query, so the UI can show
 *     "[rationale] → [matched people]".
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Optional custom intent — e.g. "founders in fintech", "investors who back
  // AI music platforms", "biotech CEOs with humanitarian focus". If present,
  // the twin's plan must respond to it directly while still using the user's
  // own context as the lens.
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
  } catch {
    /* no body is fine — open-ended planning */
  }
  const intent = typeof body.intent === "string" ? body.intent.trim().slice(0, 280) : "";
  const reason = typeof body.connection_reason === "string" ? body.connection_reason.trim().slice(0, 1000) : "";

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id).single(),
    service
      .from("twin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);
  const p = profile as Profile;
  const t = twin as TwinProfile | null;
  const selfName = p?.display_name || p?.email || "the user";
  const options = discoveryOptions(body, twin);
  if (options.scope === "local" && !options.location) {
    return NextResponse.json({ error: "missing_location", detail: "Enter a city for a local search." }, { status: 400 });
  }

  if (!t?.goals) {
    return NextResponse.json(
      { error: "twin_incomplete", detail: "Fill in goals first." },
      { status: 400 }
    );
  }

  // Step 1: Claude proposes the search queries.
  const intentBlock = intent
    ? `\n\n# PRIMARY DIRECTIVE FROM ${selfName.toUpperCase()}\n${selfName} wants you to find people that match this specific intent: "${intent}". Every suggestion MUST serve this intent. Use ${selfName}'s context above only as the lens that sharpens the search, not as a constraint that overrides the intent.`
    : "";

  const planPrompt = `You are ${selfName}'s digital twin. Your job: figure out who ${selfName} should reach out to RIGHT NOW.

# What ${selfName} has told you
Goals: ${t.goals}
Deal preferences: ${t.deal_preferences || "(not specified)"}
Deal-breakers: ${t.deal_breakers || "(not specified)"}
Other context: ${(t.ai_export_blob || "").slice(0, 4000)}${intentBlock}

# Search priorities
${discoveryScopePrompt(options)}
${reason ? `Specific reason for connecting: ${JSON.stringify(reason)}. Every suggestion should serve this purpose, even when it differs from the sender's usual goals.` : ""}

Return ONLY valid JSON with this exact shape:
{
  "suggestions": [
    {
      "rationale": "<10-20 word, first-person explanation of why this kind of person matters to ${selfName} right now>",
      "search_query": "<a punchy 4-10 word query that would find these people on the web. Concrete role + domain + signal.>"
    },
    ...
  ]
}

Rules:
- 3 or 4 suggestions. No more.
- The rationale is from ${selfName}'s point of view, written as their twin would speak ("I want to find...", "These are the people who...").
- Each search_query targets a concrete archetype (role + domain + signal), not a single named person.
- Match the user's goals concretely. Avoid generic categories like "founders" with nothing else attached.${intent ? `\n- ALL suggestions must serve the intent "${intent}" above.` : ""}`;

  type Plan = { rationale: string; search_query: string };
  let plan: Plan[] = [];
  try {
    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 700,
      system: planPrompt,
      messages: [
        { role: "user", content: "Return the JSON plan now." }
      ]
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      plan = Array.isArray(parsed.suggestions) ? parsed.suggestions
        .filter((item: Plan) => item && typeof item.rationale === "string" && typeof item.search_query === "string" && item.search_query.trim())
        .slice(0, 4) : [];
    }
  } catch (e: any) {
    console.error("twin-suggest plan error", e);
    return NextResponse.json(
      { error: "plan_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }

  if (!plan.length) {
    return NextResponse.json({ suggestions: [] });
  }

  // Step 2: run all Exa searches in parallel.
  const searches = await Promise.all(
    plan.map(async (s) => {
      try {
        const people = rankDiscoveryPeople(await exaPeopleSearch(discoveryQuery(s.search_query, options), 6), options);
        return { ...s, people };
      } catch (e) {
        console.error("twin-suggest exa search failed for", s.search_query, e);
        return { ...s, people: [] as ExaPerson[] };
      }
    })
  );

  return NextResponse.json({ suggestions: searches, search_scope: options.scope, search_location: options.location });
}
