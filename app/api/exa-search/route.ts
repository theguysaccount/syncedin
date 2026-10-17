import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exaPeopleSearch } from "@/lib/exa";

/**
 * Search the open web for people worth inviting / connecting with.
 * Auth-gated — only signed-in users can search.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  try {
    const people = await exaPeopleSearch(query, 8);
    return NextResponse.json({ people });
  } catch (e: any) {
    console.error("exa-search error", e);
    return NextResponse.json(
      { error: "search_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
