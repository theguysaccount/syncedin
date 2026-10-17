import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * One-click portfolio builder. Assigns the user a handle on first call
 * (derived from display_name → email username → uuid) and returns the
 * public URL. Idempotent — calling again with an existing handle just
 * returns the same URL.
 *
 * Replaces the "go to settings → claim handle → come back" loop Jack
 * hit when the PI page's portfolio card routed to /settings instead
 * of actually building the page.
 */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export async function POST() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("handle, display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  // Already has a handle → still ensure portfolio_page exists before
  // returning. Otherwise users like Jack who got a handle MONTHS ago
  // but never had portfolio_page populated keep landing on the legacy
  // "trash" template every time they click view-your-portfolio.
  if ((profile as any)?.handle) {
    const { data: existingPage } = await service
      .from("profiles")
      .select("portfolio_page")
      .eq("id", user.id)
      .maybeSingle();
    const hasPortfolio =
      !!(existingPage as any)?.portfolio_page &&
      Array.isArray((existingPage as any)?.portfolio_page?.sections) &&
      (existingPage as any).portfolio_page.sections.length > 0;
    if (!hasPortfolio) {
      try {
        const cookieHeader = (await cookies())
          .getAll()
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        void fetch(`${appUrl}/api/portfolio/generate`, {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json"
          }
        }).catch((e) =>
          console.warn("[build-portfolio existing] gen kick failed", e)
        );
      } catch (e) {
        console.warn("[build-portfolio existing] could not kick gen", e);
      }
    }
    return NextResponse.json({
      handle: (profile as any).handle,
      url: `${appUrl}/u/${(profile as any).handle}`,
      created: false,
      portfolio_generation_kicked: !hasPortfolio
    });
  }

  // Pick a base handle. Prefer display_name, then email username.
  const seed =
    slugify((profile as any)?.display_name ?? "") ||
    slugify((user.email ?? "").split("@")[0]) ||
    `user-${user.id.slice(0, 6)}`;

  // Collision-safe loop. Try seed, seed-2, seed-3, ... up to seed-99,
  // then fall back to a uuid-tail to guarantee uniqueness.
  let handle = seed || `user-${user.id.slice(0, 6)}`;
  let attempt = 1;
  for (; attempt < 100; attempt++) {
    const candidate = attempt === 1 ? handle : `${handle}-${attempt}`;
    const { data: existing } = await service
      .from("profiles")
      .select("id")
      .eq("handle", candidate)
      .maybeSingle();
    if (!existing) {
      handle = candidate;
      break;
    }
    if (attempt === 99) {
      handle = `${seed}-${user.id.slice(0, 8)}`;
    }
  }

  // Check if there's an existing portfolio_page — only generate when
  // the user doesn't yet have one (idempotent: re-clicks don't waste
  // tokens). Jack: "Portfolios still the same trash" — root cause was
  // that build-portfolio only assigned a HANDLE and never populated
  // portfolio_page, so the rich CustomSite renderer fell back to the
  // legacy template (which IS visually the same trash).
  const { data: existingPage } = await service
    .from("profiles")
    .select("portfolio_page")
    .eq("id", user.id)
    .maybeSingle();
  const hasPortfolio =
    !!(existingPage as any)?.portfolio_page &&
    Array.isArray((existingPage as any)?.portfolio_page?.sections) &&
    (existingPage as any).portfolio_page.sections.length > 0;

  const { error } = await service
    .from("profiles")
    .update({ handle })
    .eq("id", user.id);
  if (error) {
    // PostgREST schema-cache miss: the `handle` column exists in
    // schema.sql but the live DB hasn't been migrated yet. Tell the
    // user EXACTLY what SQL to run instead of bouncing back with the
    // raw error.
    if (/handle.*column|column.*handle|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "schema_missing",
          detail:
            "Your Supabase DB doesn't have the 'handle' column yet. Run this SQL once in Supabase → SQL Editor:\n\nalter table public.profiles add column if not exists handle text unique;\ncreate index if not exists profiles_handle_idx on public.profiles (lower(handle));\n\nThen click 'build my portfolio' again."
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 }
    );
  }

  // Trigger Claude-generated portfolio_page when missing. Without this,
  // /u/<handle> falls back to the legacy template (Jack's "trash"). We
  // hit our OWN endpoint server-side so the client sees one quick
  // response and the portfolio is ready by the time the new tab opens.
  // Fire-and-forget if generation already exists — re-runs would waste
  // tokens AND override any manual edits the user made via the editor.
  if (!hasPortfolio) {
    try {
      const cookieHeader = (await cookies())
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      const genUrl = `${appUrl}/api/portfolio/generate`;
      // Don't await — let it run in the background while the client
      // navigates to the new tab. Generate writes portfolio_page so the
      // next time the user reloads /u/<handle>, the rich CustomSite
      // renders instead of the legacy template.
      void fetch(genUrl, {
        method: "POST",
        headers: { cookie: cookieHeader, "content-type": "application/json" }
      }).catch((e) => console.warn("[build-portfolio] gen kick failed", e));
    } catch (e) {
      console.warn("[build-portfolio] could not kick gen", e);
    }
  }

  return NextResponse.json({
    handle,
    url: `${appUrl}/u/${handle}`,
    created: true,
    portfolio_generation_kicked: !hasPortfolio
  });
}
