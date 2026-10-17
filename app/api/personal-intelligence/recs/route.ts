import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";

/**
 * Personal-Intelligence recommendations generator — the first REAL
 * (not-scaffold) generator on /personal-intelligence. Given a topic
 * (movies | books | shows | albums | podcasts) and optional "why I
 * loved one" context, asks Claude to produce 5 specific, personalized
 * picks based on the user's full twin context (goals, deal prefs,
 * comm style, ai_export_blob, all ai_exports rows).
 *
 * Returns: { items: [{ title, year, why }] }
 */
const ALLOWED_KINDS = new Set([
  "movies",
  "books",
  "shows",
  "albums",
  "podcasts"
]);

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    kind?: string;
    why_loved?: string;
    already_recommended?: string[];
    loved?: string[];
    disliked?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const kind = (body.kind ?? "").toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }
  const why = (body.why_loved ?? "").trim().slice(0, 2000);
  // Accumulation signals from the client. The card persists every
  // generation locally + tracks per-item ❤ / ✕ ratings; both flow back
  // here so the next batch avoids duplicates AND learns from feedback.
  const already = Array.isArray(body.already_recommended)
    ? body.already_recommended.filter((s) => typeof s === "string").slice(0, 200)
    : [];
  const loved = Array.isArray(body.loved)
    ? body.loved.filter((s) => typeof s === "string").slice(0, 50)
    : [];
  const disliked = Array.isArray(body.disliked)
    ? body.disliked.filter((s) => typeof s === "string").slice(0, 50)
    : [];

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }, { data: exports }] =
    await Promise.all([
      service
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle(),
      service
        .from("twin_profiles")
        .select("goals, deal_preferences, communication_style, ai_export_blob")
        .eq("user_id", user.id)
        .maybeSingle(),
      service
        .from("ai_exports")
        .select("source, content")
        .eq("user_id", user.id)
    ]);

  const name =
    (profile as any)?.display_name ||
    (profile as any)?.email?.split("@")[0] ||
    "user";

  const context = [
    `Goals: ${(twin as any)?.goals || "(none)"}`,
    `Deal preferences: ${(twin as any)?.deal_preferences || "(none)"}`,
    `Comm style: ${(twin as any)?.communication_style || "(none)"}`,
    (twin as any)?.ai_export_blob
      ? `\nBio:\n${(twin as any).ai_export_blob.slice(0, 3000)}`
      : "",
    ...((exports ?? []) as any[]).map(
      (e) => `\nFrom ${e.source}:\n${(e.content || "").slice(0, 2000)}`
    )
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You're recommending ${kind} to ${name}. Use their twin context below to pick 5 SPECIFIC, personalized picks. No generic bestsellers — show you actually read their context and picked things tailored to them. For each pick:
- title (real, well-known enough to find)
- year
- why (2-3 sentences tying it directly to something in their context)

Return ONLY JSON in this exact shape:
{
  "items": [
    { "title": "...", "year": "...", "why": "..." }
  ]
}`;

  // Build the per-batch instruction block. Tells Claude:
  //   - what NOT to re-recommend (already in the user's list)
  //   - what the user has ❤'d (lean into the traits these share)
  //   - what the user has ✕'d (steer away from those traits)
  const instructionLines: string[] = [];
  if (why) {
    instructionLines.push(
      `Free-text signal from the user:\n${why}`
    );
  }
  if (loved.length > 0) {
    instructionLines.push(
      `\nThe user LOVED these — lean into their shared traits (tone, genre, themes, era, creator DNA):\n- ${loved.join(
        "\n- "
      )}`
    );
  }
  if (disliked.length > 0) {
    instructionLines.push(
      `\nThe user EXPLICITLY DID NOT LIKE these — avoid picks that share their core traits:\n- ${disliked.join(
        "\n- "
      )}`
    );
  }
  if (already.length > 0) {
    instructionLines.push(
      `\nAlready in their list (DO NOT recommend any of these again — pick 5 NEW ones):\n- ${already.join(
        "\n- "
      )}`
    );
  }

  const userContent = `${context}\n\n${instructionLines.join("\n")}\n\nGenerate 5 personalized ${kind} recommendations now. JSON only.`;

  try {
    const response = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("no_json_found");
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json({ items: parsed.items ?? [] });
  } catch (e: any) {
    console.error("[personal-intelligence/recs] gen failed", e);
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: e?.message ?? String(e)
      },
      { status: 500 }
    );
  }
}
