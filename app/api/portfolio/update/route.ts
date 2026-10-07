import { NextResponse } from "next/server";
import { contentSafetyResponse } from "@/lib/content-safety";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Save the user's portfolio About copy + theme. Also appends the about text
 * to their twin's ai_export_blob as a "# Portfolio about (self-edit)" block
 * so the twin picks up new context every time the user updates the page.
 *
 * This is the manual path; the prompt-driven editor (Claude rewrites the
 * page from a natural-language description) lands as a separate route.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    about?: string;
    theme?: {
      accent?: string;
      bg?: string;
      banner_emoji?: string;
      vibe?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const about = (body.about ?? "").toString().trim().slice(0, 4000);
  const safety = await contentSafetyResponse(about, user.id);
  if (safety) return safety;
  const theme = body.theme ?? {};
  // Strip anything that's not a 6-7 char hex color to keep the bg/accent
  // values safe to inline as CSS.
  const cleanColor = (s?: string) =>
    typeof s === "string" && /^#[0-9a-fA-F]{6,8}$/.test(s.trim())
      ? s.trim()
      : undefined;
  const cleanTheme = {
    accent: cleanColor(theme.accent) ?? "#6b2dc9",
    banner_emoji: (theme.banner_emoji ?? "").toString().slice(0, 4) || "✨",
    vibe: (theme.vibe ?? "").toString().slice(0, 60)
  };

  const service = createServiceClient();
  const { error: profErr } = await service
    .from("profiles")
    .update({
      portfolio_about: about,
      portfolio_theme: cleanTheme
    })
    .eq("id", user.id);
  if (profErr) {
    return NextResponse.json(
      { error: "save_failed", detail: profErr.message },
      { status: 500 }
    );
  }

  // Fire-and-forget: append the about text as a context block on the
  // twin's ai_export_blob. We replace any prior "# Portfolio about" block
  // (matched by exact header) so the blob doesn't accumulate duplicates
  // every time the user re-saves.
  if (about.length > 30) {
    try {
      const { data: twin } = await service
        .from("twin_profiles")
        .select("ai_export_blob")
        .eq("user_id", user.id)
        .maybeSingle();
      const blob = ((twin as any)?.ai_export_blob || "") as string;
      // Strip an existing Portfolio about block if present (header line +
      // everything up to the next `# ` or end of string).
      const stripped = blob.replace(
        /^#\s+Portfolio about \(self-edit\)[\s\S]*?(?=^#\s+|$)/gim,
        ""
      );
      const next = `# Portfolio about (self-edit)\n${about}\n\n${stripped}`.trim();
      await service
        .from("twin_profiles")
        .upsert({ user_id: user.id, ai_export_blob: next }, { onConflict: "user_id" });
    } catch (e) {
      console.warn("[portfolio/update] context append failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}
