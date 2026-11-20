"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo, type BrandKey } from "./BrandLogo";
import { ArrowRight } from "lucide-react";

/** Keep bare-handle and full-URL entry compatible with the onboarding handoff. */
type Platform = {
  key: BrandKey;
  label: string;
  prefix: string;
  // Two-form placeholder: handle-only and full-URL. We rotate between
  // them on a timer so users see at a glance that either is accepted.
  placeholderHandle: string;
  placeholderUrl: string;
};

const PLATFORMS: Platform[] = [
  {
    key: "instagram",
    label: "Instagram",
    prefix: "instagram.com/",
    placeholderHandle: "yourhandle",
    placeholderUrl: "instagram.com/yourhandle"
  },
  {
    key: "x",
    label: "X",
    prefix: "x.com/",
    placeholderHandle: "yourhandle",
    placeholderUrl: "x.com/yourhandle"
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    prefix: "linkedin.com/in/",
    placeholderHandle: "your-handle",
    placeholderUrl: "linkedin.com/in/your-handle"
  },
  {
    key: "facebook",
    label: "Facebook",
    prefix: "facebook.com/",
    placeholderHandle: "yourhandle",
    placeholderUrl: "facebook.com/yourhandle"
  }
];

/**
 * Pull the bare handle out of either form of input. Accepts:
 *   - "yourhandle"             → "yourhandle"
 *   - "@yourhandle"            → "yourhandle"
 *   - "linkedin.com/in/foo"    → "foo" (also auto-detects platform)
 *   - "https://x.com/foo?bar"  → "foo" (strips query)
 *   - "https://www.instagram.com/foo/" → "foo"
 *
 * Returns { handle, detectedPlatform? }. Detected platform overrides
 * the user's pill choice if we can tell from the URL — that's a better
 * UX than yelling about a mismatch.
 */
function parseInput(
  raw: string
): { handle: string; detectedPlatform?: BrandKey } {
  let s = raw.trim().replace(/^@+/, "");
  if (!s) return { handle: "" };
  // Strip scheme + www.
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  // Detect platform from domain.
  let detected: BrandKey | undefined;
  if (/^linkedin\.com\/in\//i.test(s)) {
    detected = "linkedin";
    s = s.replace(/^linkedin\.com\/in\//i, "");
  } else if (/^(twitter|x)\.com\//i.test(s)) {
    detected = "x";
    s = s.replace(/^(twitter|x)\.com\//i, "");
  } else if (/^instagram\.com\//i.test(s)) {
    detected = "instagram";
    s = s.replace(/^instagram\.com\//i, "");
  } else if (/^facebook\.com\//i.test(s)) {
    detected = "facebook";
    s = s.replace(/^facebook\.com\//i, "");
  }
  // Drop trailing slash + querystring + hash.
  s = s.split(/[?#]/)[0].replace(/\/+$/, "");
  return { handle: s, detectedPlatform: detected };
}

export function LandingHandleHero({
  realFaces = []
}: {
  /** Public, non-test profiles only. No synthetic customer-photo fallback. */
  realFaces?: Array<{
    id: string;
    name: string;
    avatar_url: string;
    handle: string | null;
  }>;
} = {}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[2]); // LinkedIn default
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Toggle between two placeholder forms on a timer so the user sees
  // that BOTH "yourhandle" and "linkedin.com/in/yourhandle" work. Index
  // 0 = handle-only, 1 = full URL.
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setPhIdx((i) => (i + 1) % 2), 2600);
    return () => clearInterval(t);
  }, []);
  const placeholder =
    phIdx === 0 ? platform.placeholderHandle : platform.placeholderUrl;

  async function go() {
    const parsed = parseInput(handle);
    const h = parsed.handle;
    if (!h || busy) return;
    // If the user pasted a full URL we can detect the platform from —
    // switch the active pill so the routing matches what they typed.
    const effectivePlatform =
      (parsed.detectedPlatform &&
        PLATFORMS.find((p) => p.key === parsed.detectedPlatform)) ||
      platform;
    setBusy(true);
    setErr("");
    try {
      // Build the synthetic profile URL from the chosen platform.
      const profileUrl = `https://${effectivePlatform.prefix}${h}`;
      // Stash the intended URL so the post-login onboarding flow can
      // prefill scrape context from it immediately.
      try {
        sessionStorage.setItem(
          "syncedin.signupIntent",
          JSON.stringify({
            profile_url: profileUrl,
            platform: effectivePlatform.key
          })
        );
      } catch {
        /* private mode */
      }
      // Route to login with a redirect back to onboarding so the new
      // user immediately gets their twin scaffolded from this URL.
      router.push(
        `/login?next=${encodeURIComponent("/onboarding?welcome=1")}`
      );
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lh-hero">
      <style>{`
        .lh-hero {
          max-width: 860px;
          margin: 0 auto;
          padding: 20px 24px 24px;
          color: var(--text);
        }
        .lh-social-context {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          margin-top: 16px;
          color: var(--text-dim);
          font-size: 12px;
        }
        .lh-avatars { display: inline-flex; }
        .lh-avatars img {
          width: 36px; height: 36px; border-radius: 999px;
          border: 2.5px solid var(--panel-solid);
          object-fit: cover;
          margin-left: -10px;
        }
        .lh-avatars img:first-child { margin-left: 0; }
        .lh-h1 {
          font-size: 64px;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.0;
          margin: 0;
          color: var(--text);
          overflow-wrap: anywhere;
        }
        @media (max-width: 600px) { .lh-h1 { font-size: 36px; line-height: 1.1; } .lh-hero { padding-inline: 20px; } }
        @media (max-width: 360px) {
          .lh-h1 { font-size: 28px; line-height: 1.12; }
          .lh-hero { padding-top: 12px; padding-bottom: 12px; }
          .lh-hero .lh-sub { margin-top: 12px; font-size: 16px; }
          .lh-hero .lh-platforms { margin-top: 18px; }
          .lh-hero .lh-input-label { margin-top: 16px; }
        }
        .lh-sub {
          margin-top: 16px;
          font-size: 17px;
          line-height: 1.5;
          color: var(--text-dim);
          max-width: 640px;
        }
        .lh-sub strong { color: var(--text); font-weight: 700; }

        .lh-platforms {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-top: 24px;
        }
        .lh-pill {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px;
          border-radius: 6px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
          transition:
            background 0.15s ease,
            border-color 0.15s ease,
            transform 0.12s ease;
        }
        .lh-pill:hover { border-color: var(--text); }
        .lh-pill.active {
          background: var(--text);
          color: var(--bg);
          border-color: var(--text);
        }

        .lh-input-wrap {
          position: relative;
          margin-top: 8px;
        }
        .lh-input-label { display: block; margin-top: 20px; font-size: 14px; font-weight: 600; }
        .lh-input-prefix {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim);
          font-size: 18px;
          pointer-events: none;
        }
        .lh-input {
          width: 100%;
          padding: 15px 18px 15px 38px;
          font-size: 17px;
          border-radius: 6px;
          border: 1.5px solid var(--border);
          background: transparent;
          color: var(--text);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .lh-input:focus {
          outline: 3px solid var(--home-accent, #305ce5);
          outline-offset: 3px;
          border-color: var(--home-accent, #305ce5);
          box-shadow: 0 0 0 4px rgba(31, 139, 255, 0.14);
        }

        .lh-cta {
          margin-top: 10px;
          width: 100%;
          padding: 15px 22px;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0;
          color: #fff;
          background: #305ce5;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: transform 0.12s ease, box-shadow 0.18s ease;
          box-shadow: 0 12px 30px -10px rgba(31, 89, 255, 0.55);
        }
        .lh-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 36px -10px rgba(31, 89, 255, 0.65);
        }
        .lh-cta:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }
        .lh-cta .arrow { transition: transform 0.15s ease; }
        .lh-cta:hover .arrow { transform: translateX(3px); }

        .lh-microcopy {
          margin-top: 10px;
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
        }

        .lh-error {
          margin-top: 10px;
          font-size: 13px;
          color: #ef4444;
          text-align: center;
        }
      `}</style>

      <h1 className="lh-h1">
        AI networking.
        <br />
        With your context.
      </h1>
      <p className="lh-sub">
        Start from a public profile. Review the context your twin uses
        and the conversation it drafts before choosing what to share.
      </p>

      {/* Platform pills */}
      <div className="lh-platforms" role="group" aria-label="Profile platform">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={platform.key === p.key}
            onClick={() => setPlatform(p)}
            className={`lh-pill ${platform.key === p.key ? "active" : ""}`}
          >
            <span aria-hidden="true"><BrandLogo brand={p.key} size={14} tone={platform.key === p.key ? "mono" : "brand"} /></span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      <label className="lh-input-label" htmlFor="signup-profile-handle">Your public profile handle or URL</label>
      <div className="lh-input-wrap">
        <span className="lh-input-prefix" aria-hidden="true">@</span>
        <input
          id="signup-profile-handle"
          data-clarity-mask="True"
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void go();
            }
          }}
          placeholder={placeholder}
          className="lh-input"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <button
        type="button"
        onClick={go}
        disabled={!handle.trim() || busy}
        className="lh-cta"
      >
        <span>{busy ? "Continuing..." : "Build my twin"}</span>
        <ArrowRight size={19} className="arrow" aria-hidden="true" />
      </button>

      <p className="lh-microcopy">
        Continue to sign-in and review your profile during onboarding.
      </p>

      {realFaces.length > 0 && <div className="lh-social-context">
        <div className="lh-avatars" aria-hidden="true">{realFaces.slice(0, 3).map(face => <img key={face.id} src={face.avatar_url} alt={face.name} title={face.name} loading="eager" referrerPolicy="no-referrer" />)}</div>
        <span>People with public profiles on SyncedIn</span>
      </div>}

      {err && <p className="lh-error" role="alert">{err}</p>}
    </section>
  );
}
