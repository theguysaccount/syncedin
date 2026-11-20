"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, UserRound } from "lucide-react";

type ScrapeResult = {
  ok?: boolean;
  source_url?: string;
  name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  links?: Array<{ label: string; url: string; intent: string }>;
  error?: string;
  detail?: string;
};

// Pre-signup hand-off: we stash the scrape in sessionStorage so the
// onboarding flow can pick it up after the user signs in via Google /
// magic link. Keyed under a single stable key — last import wins.
const HANDOFF_KEY = "syncedin_linkme_handoff_v1";
const INTENT_LABELS: Record<string, string> = {
  booking: "Booking", course: "Course", podcast: "Podcast", video: "Video",
  social_x: "X", social_ig: "Instagram", social_linkedin: "LinkedIn", social_tiktok: "TikTok",
  code: "Code", newsletter: "Writing", commerce: "Shop", advisory: "Advisory", email: "Email", other: "Link",
};

/**
 * Client island for /for/linkme. Single input → fires scrape API →
 * renders a preview card the user can confirm before signing up.
 * Mobile-first, just like the DM chat.
 */
export function LinkmeImporter() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/linkme-import?url=${encodeURIComponent(url.trim())}`,
        { cache: "no-store" }
      );
      const j: ScrapeResult = await res.json();
      if (!res.ok || j.error) {
        setErr(j.detail || j.error || "Couldn't import that URL.");
        return;
      }
      setResult(j);
      // Stash for the post-signup wire-up.
      try {
        window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(j));
      } catch {
        /* private mode — non-fatal */
      }
    } catch (e: any) {
      setErr(e?.message ?? "Network error.");
    } finally {
      setBusy(false);
    }
  }

  function continueToSignup() {
    // Carry a flag through the auth flow so the post-signup hook knows
    // to apply the cached scrape (the actual data lives in
    // sessionStorage under HANDOFF_KEY, set above). Auth lives at
    // /login (handles both signup + signin via magic link / Google).
    // `next` lands the user on /onboarding after auth completes.
    window.location.href =
      "/login?from=linkme&next=" +
      encodeURIComponent("/onboarding?from=linkme");
  }

  if (result?.ok) {
    return (
      <div
        data-clarity-mask="True"
        style={{
          background: "var(--panel-solid)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 18,
          boxShadow: "0 12px 36px -16px rgba(31, 89, 255, 0.15)"
        }}
      >
        {/* PROFILE PREVIEW */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 12
          }}
        >
          {result.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.avatar_url}
              alt={result.name ?? "you"}
              width={56}
              height={56}
              referrerPolicy="no-referrer"
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                objectFit: "cover",
                border: "2px solid var(--panel-solid)",
                boxShadow: "0 0 0 1px #e8e6f5"
              }}
            />
          ) : (
            <div
              role="img"
              aria-label="No profile photo"
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                background: "var(--panel-2)",
                color: "var(--text-dim)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            ><UserRound size={23} aria-hidden="true" /></div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, overflowWrap: "anywhere" }}>
              {result.name ?? "(no name found)"}
            </div>
            {result.bio && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  lineHeight: 1.4,
                  marginTop: 2
                }}
              >
                {result.bio.slice(0, 160)}
              </div>
            )}
          </div>
        </div>

        {/* LINKS PULLED */}
        {result.links && result.links.length > 0 && (
          <div
            style={{
              borderTop: "1px dashed var(--border)",
              paddingTop: 12,
              marginTop: 6
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0,
                textTransform: "uppercase",
                color: "var(--text-dim)",
                marginBottom: 8
              }}
            >
              {result.links.length} link{result.links.length === 1 ? "" : "s"}{" "}
              found in this preview
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 240,
                overflowY: "auto"
              }}
            >
              {result.links.slice(0, 12).map((l, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "var(--panel-2)",
                    fontSize: 13
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0,
                      color: "var(--accent)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--panel-solid)",
                      flexShrink: 0
                    }}
                  >
                    {Object.hasOwn(INTENT_LABELS, l.intent) ? INTENT_LABELS[l.intent] : "Link"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {l.label}
                  </span>
                </div>
              ))}
              {result.links.length > 12 && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    paddingLeft: 8
                  }}
                >
                  + {result.links.length - 12} more
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={continueToSignup}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "14px 16px",
            borderRadius: 6,
            border: "none",
            background: "#305ce5",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          Continue to my twin <ArrowRight size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setUrl("");
          }}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "10px 16px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--panel-solid)",
            color: "var(--text-dim)",
            fontSize: 13,
            cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Try a different URL
        </button>
      </div>
    );
  }

  return (
    <div data-clarity-mask="True" aria-busy={busy}>
      <label htmlFor="linkme-profile-url" style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Public profile URL</label>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "stretch"
        }}
      >
        <input
          id="linkme-profile-url"
          aria-describedby="linkme-import-note"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="link.me/yourname"
          style={{
            flex: 1,
            padding: "14px 16px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--panel-solid)",
            color: "var(--text)",
            fontSize: 16,
            minWidth: 0
          }}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !url.trim()}
          style={{
            padding: "0 18px",
            borderRadius: 6,
            border: "none",
            background: "#305ce5",
            opacity: busy || !url.trim() ? 0.5 : 1,
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: busy ? "wait" : "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          {busy && <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {busy ? "Reading..." : "Read profile"}
        </button>
      </div>
      <div
        id="linkme-import-note"
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          marginTop: 8,
          lineHeight: 1.5
        }}
      >
        Accepts link.me/yourname, yourname.link.me, and linktr.ee profile URLs.
        Results may be incomplete. Review the imported details before continuing.
      </div>
      {err && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 6,
            background: "var(--panel-2)",
            border: "1px solid var(--red)",
            color: "var(--red)",
            fontSize: 13,
            lineHeight: 1.5
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
