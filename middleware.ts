import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  const earlyPath = request.nextUrl.pathname;
  // Hard short-circuit for OG/Twitter image routes and any static asset that
  // scrapers (iMessage LP, Twitter, Facebook, Slack) fetch. We DO NOT touch
  // supabase cookies for these — that's what poisons Cache-Control with
  // private/no-store and prevents Apple from caching the rich preview.
  if (
    earlyPath === "/opengraph-image" ||
    earlyPath === "/twitter-image" ||
    earlyPath.endsWith("/opengraph-image") ||
    earlyPath.endsWith("/twitter-image") ||
    /^\/social\/previews\/[a-z0-9-]+\.mp4$/.test(earlyPath) ||
    earlyPath === "/robots.txt" ||
    earlyPath === "/sitemap.xml" ||
    earlyPath === "/manifest.json" ||
    // API routes manage their own auth — middleware must NOT inject
    // Supabase session cookies into JSON responses (poisons Cache-
    // Control AND can return HTML on errors). Each /api route that
    // needs auth calls supabase.auth.getUser() itself.
    earlyPath.startsWith("/api/") ||
    // IndexNow key-file path (alphanumeric .txt at root) — must serve
    // plain text to the search engines verbatim.
    /^\/[a-zA-Z0-9]+\.txt$/.test(earlyPath)
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Explicit allowlist of PROTECTED top-level routes. Anything else (including
  // single-segment slug invite pages like /jason-lv) is public so that link
  // previewers (iMessage, Slack, Twitter, etc.) can scrape per-page OG tags
  // without being bounced to /login.
  const PROTECTED_PREFIXES = [
    "/dashboard",
    "/onboarding",
    "/conversations",
    "/messages",
    "/settings"
  ];
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // === Last-active stamp ===
  // Fire-and-forget update of profiles.last_active_at so dashboard
  // cards can render "active 3h ago" badges. Debounced via cookie:
  // we only write to the DB if `syncedin_last_stamp` is missing or
  // > 5 minutes old, so a chatty user navigating between pages
  // doesn't hammer the table on every request. The cookie itself is
  // session-scoped and harmless to share across browsers.
  if (user) {
    const STAMP_COOKIE = "syncedin_last_stamp";
    const DEBOUNCE_MS = 5 * 60 * 1000;
    const cookieVal = request.cookies.get(STAMP_COOKIE)?.value;
    const lastStampMs = cookieVal ? Number(cookieVal) : 0;
    const now = Date.now();
    if (!lastStampMs || now - lastStampMs > DEBOUNCE_MS) {
      // Stamp the cookie up-front so concurrent requests don't all
      // race to the same write.
      response.cookies.set(STAMP_COOKIE, String(now), {
        path: "/",
        sameSite: "lax",
        // 30-day rolling cookie is plenty — the value is just a
        // debounce hint, not a session token.
        maxAge: 60 * 60 * 24 * 30
      });
      // Fire-and-forget. Never awaited; never blocks the response.
      // Wrapped in try/catch so a missing column on prod doesn't crash.
      void (async () => {
        try {
          await supabase
            .from("profiles")
            .update({ last_active_at: new Date(now).toISOString() })
            .eq("id", user.id);
        } catch {
          /* column may not yet be migrated on this DB — silent skip */
        }
      })();
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp)$).*)"]
};
