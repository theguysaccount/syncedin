import Link from "next/link";
import {
  login,
  signInWithPassword,
  signUpWithPassword
} from "./actions";
import { Wordmark } from "../Wordmark";
import { OAuthButtons } from "./OAuthButtons";
import { createServiceClient } from "@/lib/supabase/server";
import { RealFacesStrip, type FaceRow } from "../[slug]/RealFacesStrip";

// Google "G" logo — official multi-color inline SVG.
function GoogleLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width="20"
      height="20"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

// Apple logo — single-color inline SVG.
function AppleLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: {
    sent?: string;
    error?: string;
    detail?: string;
    invite?: string;
    conference?: string;
    exists?: string;
  };
}) {
  const sent = searchParams.sent === "1";
  const exists = searchParams.exists === "1";
  const detail = searchParams.detail || null;

  // Pull up to 8 existing SyncedIn members with real photos so prospects
  // see who's actually inside before signing up. Jack: "we can add value
  // on that signup page where we show all the other faces they're able
  // to connect with as well." Best-effort — silently degrade to no
  // strip if the query fails.
  let faces: FaceRow[] = [];
  try {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("profiles")
      .select(
        "id, display_name, avatar_url, handle, portfolio_about, email"
      )
      .not("avatar_url", "is", null)
      .not("display_name", "is", null)
      .neq("is_test_persona", true)
      .limit(40);
    const candidates = ((rows ?? []) as any[]).filter(
      (r) => (r.avatar_url || "").length > 8
    );
    // Shuffle deterministically so the strip varies but isn't jittery
    // per-request (no Date.now() — that would break SSR cache layers).
    const seeded = [...candidates].sort((a, b) =>
      (a.id as string).localeCompare(b.id as string)
    );
    faces = seeded.slice(0, 8).map((r) => ({
      id: r.id,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      handle: r.handle,
      headline:
        (r.portfolio_about as string | null)?.split("\n")[0]?.slice(0, 110) ??
        null
    }));
  } catch {
    /* no faces strip — degrade gracefully */
  }

  return (
    <main className="max-w-3xl mx-auto px-5 py-4 sm:py-6">
      {/* Jack: 'make this element a bit more collapsed such that there's
          no scrolling even possible on this page.' Top/bottom padding
          shrunk, panel padding shrunk, headline shrunk, dividers thinner,
          legal copy moved inline. Whole screen now fits in 100vh on
          typical laptop heights (≥720px). */}
      <Link href="/" className="retro-dim text-xs">
        &lt; back
      </Link>

      <div className="mt-2 retro-panel retro-shadow p-4 sm:p-5">
        {/* Compact header */}
        <div className="flex flex-col items-center text-center">
          <Wordmark size="md" />
          <h1
            className="retro-h1 text-xl sm:text-2xl mt-1 leading-tight"
            style={{ letterSpacing: 0 }}
          >
            Join the platform of the future
          </h1>
          <p
            className="mt-1 text-xs sm:text-sm"
            style={{ color: "var(--text-dim)" }}
          >
            Find people who share your interests.
          </p>
        </div>

        {/* Google FIRST — fastest path (Jack: "I like Google first"). Email +
            password stay below as alternatives. */}
        <div className="mt-3 space-y-2">
          <OAuthButtons
            invite={searchParams.invite}
            conference={searchParams.conference}
          />
          {false && (
            <>
              <GoogleLogo />
              <AppleLogo />
            </>
          )}
        </div>

        <div className="my-3 flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="retro-label">or use your email</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Magic link */}
        <form className="space-y-2">
          <input type="hidden" name="invite" value={searchParams.invite ?? ""} />
          <input
            type="hidden"
            name="conference"
            value={searchParams.conference ?? ""}
          />
          <input
            name="email"
            type="email"
            aria-label="Email for magic link"
            required
            autoComplete="email"
            placeholder="you@domain.com"
            className="retro-input"
          />
          <button formAction={login} className="retro-btn w-full">
            Email me a magic link
          </button>
        </form>

        {sent && (
          <p className="mt-3 text-sm retro-green text-center">
            ✓ Check your inbox — the link works in any browser.
          </p>
        )}

        {exists && (
          <div
            className="mt-3 p-3 retro-panel"
            style={{ borderColor: "var(--amber)" }}
          >
            <p className="text-sm retro-amber font-semibold">
              You already have an account
            </p>
            <p className="mt-1 text-xs retro-dim break-words">
              We just emailed a sign-in link to that address — open it in any
              browser to get straight in. Or sign in with your password below.
            </p>
          </div>
        )}

        <div className="my-3 flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="retro-label">or password</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Email + password as the third option */}
        <form className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="invite" value={searchParams.invite ?? ""} />
          <input
            type="hidden"
            name="conference"
            value={searchParams.conference ?? ""}
          />
          <input
            name="email"
            type="email"
            aria-label="Email for password sign-in"
            required
            autoComplete="email"
            placeholder="you@domain.com"
            className="retro-input"
          />
          <input
            name="phone_number"
            type="tel"
            aria-label="Phone number for new account"
            autoComplete="tel"
            placeholder="phone for new accounts"
            className="retro-input"
          />
          <input
            name="password"
            type="password"
            aria-label="Password"
            autoComplete="current-password"
            placeholder="password (8+ characters)"
            className="retro-input sm:col-span-2"
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              formAction={signInWithPassword}
              className="retro-btn flex-1"
            >
              Sign in
            </button>
            <button
              formAction={signUpWithPassword}
              className="retro-btn flex-1"
            >
              Create account
            </button>
          </div>
        </form>

        {searchParams.error && (
          <div
            className="mt-5 p-3 retro-panel"
            style={{ borderColor: "var(--red)" }}
          >
            <p className="text-sm retro-red font-semibold">
              ! Something went wrong
            </p>
            {detail && (
              <p className="mt-1 text-xs retro-dim break-words">{detail}</p>
            )}
          </div>
        )}
      </div>

      {/* Compact legal/footer row inline so Privacy / Terms / Support /
          Contact are visible without scrolling. Jack: 'right now I have
          to scroll down to see privacy, terms, support, contact, but I
          think we can just bring it all up.' */}
      <div
        className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]"
        style={{ color: "var(--text-dim)" }}
      >
        <Link href="/privacy" style={{ color: "inherit" }}>privacy</Link>
        <span>·</span>
        <Link href="/terms" style={{ color: "inherit" }}>terms</Link>
        <span>·</span>
        <Link href="/support" style={{ color: "inherit" }}>support</Link>
        <span>·</span>
        <a href="mailto:hi@syncedin.org" style={{ color: "inherit" }}>
          contact
        </a>
      </div>

      {/* Real-faces strip — moved here OUTSIDE the visible viewport (it
          loads in below the fold for users who scroll). The fold-cleanup
          requirement Jack flagged comes first; the faces strip is
          reinforcement that only matters if the user scrolls. */}
      {faces.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <RealFacesStrip faces={faces} />
        </div>
      )}
    </main>
  );
}
