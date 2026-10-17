import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_SYNC_PROMPT } from "@/lib/sync-score-prompt";

/**
 * GET / POST the user's custom sync-score prompt.
 *
 * The platform ships a deterministic algorithmic sync score
 * (lib/pair-score.ts) — token + bigram overlap + complementary-fit
 * regex + substance floor. DEFAULT_SYNC_PROMPT (imported from /lib —
 * route files in Next.js App Router can ONLY export route handlers,
 * not arbitrary constants, which blocked the build at commit e18c0ee).
 *
 * If the user writes their own override, we store it; the (i) tooltip
 * on the dashboard renders their override instead of the default.
 *
 * GET → { prompt: string, is_custom: boolean }
 * POST { prompt: string } → { ok: true }
 * DELETE → resets to default (clears the override)
 */

export async function GET() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  let custom: string | null = null;
  try {
    const { data } = await service
      .from("twin_profiles")
      .select("sync_score_prompt")
      .eq("user_id", user.id)
      .maybeSingle();
    custom = ((data as any)?.sync_score_prompt as string | null) ?? null;
  } catch {
    /* column may not exist yet on prod — fall through with null */
  }

  return NextResponse.json({
    prompt: custom && custom.trim() ? custom : DEFAULT_SYNC_PROMPT,
    is_custom: !!(custom && custom.trim()),
    default_prompt: DEFAULT_SYNC_PROMPT
  });
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").toString().trim().slice(0, 8000);

  const service = createServiceClient();
  try {
    await service.from("twin_profiles").upsert(
      {
        user_id: user.id,
        sync_score_prompt: prompt || null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
  } catch (e: any) {
    if (/sync_score_prompt|column|schema cache/i.test(e?.message ?? "")) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Your DB needs the new column. Run this SQL once in Supabase → SQL Editor:\n\nalter table public.twin_profiles add column if not exists sync_score_prompt text;"
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  return POST(new Request("https://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "" })
  }));
}
