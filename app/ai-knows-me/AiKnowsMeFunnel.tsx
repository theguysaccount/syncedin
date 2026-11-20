"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, Share2, Sparkles } from "lucide-react";
import { BrandLogo, type BrandKey } from "../BrandLogo";
import { track } from "@/lib/track";
import { TrustNote } from "../TrustNote";
import { PROFILE_PREVIEW_CONTEXT_LIMIT, SHAREABLE_PROFILE_PROMPT } from "@/lib/profile-preview-copy";
import { parseProfilePreview } from "@/lib/profile-preview-result";

/**
 * AiKnowsMeFunnel, the conversion engine for /ai-knows-me.
 *
 * Built to be FILMED. The whole flow is a performance: paste what your AI
 * said about you, watch the decoder visibly read it (scanner beam over
 * your real text, honest status lines), then a staggered cinematic reveal
 * of your Personal Intelligence card, confetti, watermark, share.
 *
 * Honesty rules (Jack): every number shown is real (character count is
 * the real paste length), the decode is a real call to
 * /api/portfolio-preview, and the status lines describe what the model is
 * actually asked to do (read the dump, write headline / about /
 * highlights). Animation is pacing, never fabrication.
 *
 * The paste is stashed under the same localStorage key as
 * /generate-free-portfolio so signup → onboarding prefills the twin.
 */

const APPS: { key: BrandKey; label: string; url: string }[] = [
  { key: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com" },
  { key: "claude", label: "Claude", url: "https://claude.ai/new" },
  { key: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
  { key: "grok", label: "Grok", url: "https://grok.com" }
];

const SHARE_URL = "https://syncedin.org/ai-knows-me";
const SHARE_TEXT =
  "Create a profile preview from professional context with SyncedIn:";

// Honest narration of what the decoder is doing with the paste. The API
// call reads the dump and writes headline + about + highlights; these
// lines walk through exactly that.
const DECODE_LINES = [
  "Reading the context you provided...",
  "Selecting details from your summary...",
  "Drafting your headline...",
  "Writing an about section...",
  "Preparing highlights for review..."
];

type Phase = "idle" | "decoding" | "reveal";

export function AiKnowsMeFunnel() {
  const [name, setName] = useState("");
  const [dump, setDump] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [decodeLine, setDecodeLine] = useState(0);
  const [typedHeadline, setTypedHeadline] = useState("");
  const [confetti, setConfetti] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [result, setResult] = useState<{
    headline: string;
    about: string;
    highlights: string[];
    people: { name: string; why: string }[];
  } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    setReduceMotion(
      typeof window !== "undefined" &&
        !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // Rotate the honest status lines while the real decode is in flight.
  useEffect(() => {
    if (phase !== "decoding") return;
    const t = setInterval(
      () => setDecodeLine((i) => (i + 1) % DECODE_LINES.length),
      1500
    );
    return () => clearInterval(t);
  }, [phase]);

  // Typewriter for the revealed headline (instant if reduced motion).
  useEffect(() => {
    if (phase !== "reveal" || !result) return;
    const full = result.headline || "";
    if (reduceMotion || !full) {
      setTypedHeadline(full);
      return;
    }
    setTypedHeadline("");
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setTypedHeadline(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 28);
    return () => clearInterval(t);
  }, [phase, result, reduceMotion]);

  // One-shot confetti right after the card lands.
  useEffect(() => {
    if (phase !== "reveal" || reduceMotion) return;
    const t = setTimeout(() => setConfetti(true), 350);
    const off = setTimeout(() => setConfetti(false), 2600);
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
  }, [phase, reduceMotion]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(SHAREABLE_PROFILE_PROMPT);
      setCopied(true);
      track("prompt_copied");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked */
    }
  }

  async function shareTest() {
    try {
      if (navigator.share) {
        await navigator.share({ text: SHARE_TEXT, url: SHARE_URL });
      } else {
        await navigator.clipboard.writeText(`${SHARE_TEXT} ${SHARE_URL}`);
      }
      setShared(true);
      track("share_clicked");
      setTimeout(() => setShared(false), 2200);
    } catch {
      /* share dismissed or clipboard blocked */
    }
  }

  async function decode() {
    if (requestInFlight.current) return;
    if (dump.trim().length < 20) {
      setErr("Add a reviewed professional summary of at least 20 characters.");
      return;
    }
    requestInFlight.current = true;
    setErr(null);
    setPhase("decoding");
    setDecodeLine(0);
    track("decode_started", { chars: dump.length });
    try {
      // Stash so signup → onboarding prefills the twin + full portfolio.
      try {
        localStorage.setItem(
          "syncedin-portfolio-seed",
          JSON.stringify({ name, dump })
        );
      } catch {
        /* storage blocked, still works, just no prefill */
      }
      const response = await fetch("/api/portfolio-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, dump })
      });
      const body: unknown = await response.json().catch(() => null);
      const preview = response.ok ? parseProfilePreview(body) : null;
      if (!preview) {
        track("decode_failed");
        setErr("Couldn't prepare a complete preview. Your summary is still here; please try again.");
        setPhase("idle");
        return;
      }
      const people = preview.people;
      // Re-stash with people so /ghosts can prefill one-tap targets
      // after signup. Same key onboarding already reads.
      try {
        localStorage.setItem(
          "syncedin-portfolio-seed",
          JSON.stringify({ name, dump, people })
        );
        // Onboarding consumes + deletes the seed, so persist the people
        // separately: /ghosts reads this key to offer one-tap targets
        // even after the wizard has eaten the seed.
        localStorage.setItem(
          "syncedin-decode-people",
          JSON.stringify(people)
        );
      } catch {
        /* storage blocked */
      }
      setResult(preview);
      track("decode_done", { chars: dump.length, people: people.length });
      setPhase("reveal");
    } catch {
      track("decode_failed");
      setErr("Something went wrong. Try again.");
      setPhase("idle");
    } finally {
      requestInFlight.current = false;
    }
  }

  /* ---------------------------- DECODING ---------------------------- */
  if (phase === "decoding") {
    const excerpt = dump
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 12);
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }} data-clarity-mask="True" aria-busy="true">
        <KeyframeStyles />
        <div
          className="retro-panel retro-shadow"
          style={{ padding: 24, position: "relative", overflow: "hidden" }}
        >
          <div className="retro-label" style={{ color: "var(--amber-bright)" }}>
            decoding {dump.length.toLocaleString()} characters
          </div>
          <div
            aria-live="polite"
            style={{
              marginTop: 10,
              fontSize: 17,
              fontWeight: 800,
              minHeight: 26,
              animation: reduceMotion ? undefined : "aikm-pulse 1.5s ease infinite"
            }}
          >
            {DECODE_LINES[decodeLine]}
          </div>

          <div
            style={{
              marginTop: 16,
              position: "relative",
              borderRadius: 12,
              border: "1px solid var(--border)",
              padding: "14px 16px",
              maxHeight: 220,
              overflow: "hidden"
            }}
          >
            {excerpt.map((l, i) => (
              <div
                key={i}
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11.5,
                  lineHeight: 1.8,
                  color: "var(--text-dim)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  opacity: 0.85
                }}
              >
                {l}
              </div>
            ))}
            {!reduceMotion && <div className="aikm-beam" />}
          </div>

          <div
            style={{
              marginTop: 16,
              height: 4,
              borderRadius: 2,
              background: "var(--panel-2)",
              overflow: "hidden"
            }}
          >
            <div className="aikm-progress" />
          </div>
          <p className="retro-dim" style={{ marginTop: 10, fontSize: 12 }}>
            Preparing a draft from your summary. Generation time can vary.
          </p>
        </div>
      </div>
    );
  }

  /* ----------------------------- REVEAL ----------------------------- */
  if (phase === "reveal" && result) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", position: "relative" }} data-clarity-mask="True">
        <KeyframeStyles />
        {confetti && <ConfettiBurst />}
        <div
          className="aikm-rise"
          style={{ animationDelay: "0s" }}
        >
          <div className="retro-label" style={{ color: "var(--green)" }}>
            Draft profile preview
          </div>
        </div>

        {/* The screenshot card. Watermarked so every screen recording and
            screenshot carries the link. */}
        <div
          ref={cardRef}
          className="retro-panel retro-shadow aikm-card-in"
          style={{ marginTop: 12, padding: 24, position: "relative" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0,
                textTransform: "uppercase",
                color: "var(--amber-bright)"
              }}
            >
              Personal Intelligence
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                color: "var(--text-dim)"
              }}
            >
              For review
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 26,
              fontWeight: 850,
              letterSpacing: 0, overflowWrap: "anywhere",
              lineHeight: 1.1,
              color: "var(--text)"
            }}
          >
            {name || "Your profile preview"}
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 17,
              color: "var(--amber-bright)",
              fontWeight: 750,
              minHeight: 24,
              lineHeight: 1.35
            }}
          >
            {typedHeadline}
            {!reduceMotion && typedHeadline.length < (result.headline || "").length && (
              <span className="aikm-caret">▌</span>
            )}
          </div>

          {result.about && (
            <p
              className="aikm-rise"
              style={{
                marginTop: 12,
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--text)",
                animationDelay: "0.5s"
              }}
            >
              {result.about}
            </p>
          )}

          {result.highlights.length > 0 && (
            <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.7, listStyle: "disc" }}>
              {result.highlights.map((h, i) => (
                <li
                  key={i}
                  className="aikm-rise"
                  style={{
                    fontSize: 14,
                    color: "var(--text-dim)",
                    animationDelay: `${0.8 + i * 0.25}s`
                  }}
                >
                  {h}
                </li>
              ))}
            </ul>
          )}

          {result.people.length > 0 && (
            <div
              className="aikm-rise"
              style={{ marginTop: 16, animationDelay: "1.2s" }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  color: "var(--text-dim)"
                }}
              >
                Names to review
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6
                }}
              >
                {result.people.map((p, i) => (
                  <span
                    key={i}
                    title={p.why}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      color: "var(--text)"
                    }}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--text-dim)",
                  lineHeight: 1.5
                }}
              >
                Check these mentions before using them in a profile or
                introduction.
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: 18,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--text-dim)"
            }}
          >
            <span>decoded at syncedin.org/ai-knows-me</span>
            <span style={{ fontWeight: 700 }}>SyncedIn</span>
          </div>
        </div>

        <div className="aikm-rise" style={{ animationDelay: "1.4s" }}>
          <Link
            href="/login?next=/onboarding"
            onClick={() => track("claim_clicked")}
            className="retro-btn retro-btn-primary"
            style={{
              marginTop: 16,
              width: "100%",
              textAlign: "center",
              textDecoration: "none",
              padding: "14px 16px",
              fontSize: 16,
              fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "#305ce5", borderRadius: 6, minHeight: 44,
            }}
          >
            Continue to my profile <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--text-dim)",
              textAlign: "center"
            }}
          >
            Sign in to continue with this draft, then review your profile and
            onboarding choices.
          </p>
          <button
            type="button"
            onClick={shareTest}
            className="retro-btn"
            style={{ marginTop: 10, width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, borderRadius: 6 }}
          >
            {shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
            {shared ? "Tool link ready" : "Share the preview tool"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setResult(null);
              setTypedHeadline("");
            }}
            style={{
              marginTop: 8,
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              fontSize: 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Edit my summary
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------ IDLE ------------------------------ */
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }} data-clarity-mask="True">
      <KeyframeStyles />
      <div className="retro-panel retro-shadow" style={{ padding: 20 }}>
        <div className="retro-label">Step 1 / Prepare a summary</div>
        <p
          className="retro-dim"
          style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}
        >
          Ask for work, goals, interests, and what you can offer. Review the
          answer and remove anything that does not belong in a professional profile.
        </p>
        <button
          type="button"
          onClick={copyPrompt}
          className="retro-btn retro-btn-primary w-full"
          style={{ marginTop: 12, padding: "12px 14px", fontWeight: 700, background: "#305ce5", borderRadius: 6, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
          {copied ? "Prompt copied" : "Copy the prompt"}
        </button>

        <div className="retro-label" style={{ marginTop: 18 }}>
          Step 2 / Use your AI
        </div>
        <div
          style={{
            marginTop: 8,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))"
          }}
        >
          {APPS.map((a) => (
            <a
              key={a.key}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="retro-btn text-xs"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center", borderRadius: 6, minHeight: 44,
              }}
            >
              <BrandLogo brand={a.key} size={16} />
              <span style={{ fontWeight: 700 }}>{a.label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="retro-label" style={{ marginTop: 18 }}>
        Step 3 / Review and preview
      </div>
      <label htmlFor="ai-preview-name" style={{ display: "block", marginTop: 12, fontSize: 14, fontWeight: 600 }}>Professional name (optional)</label>
      <input
        id="ai-preview-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your professional name"
        className="retro-input"
        style={{ marginTop: 8 }}
      />
      <label htmlFor="ai-preview-context" style={{ display: "block", marginTop: 18, fontSize: 14, fontWeight: 600 }}>Professional summary</label>
      <textarea
        id="ai-preview-context"
        aria-describedby="ai-preview-data-note"
        value={dump}
        onChange={(e) => setDump(e.target.value)}
        rows={7}
        placeholder="Your work, goals, what you can offer, and what you want to explore. Review the facts and remove private details first."
        className="retro-input"
        style={{ marginTop: 8, fontSize: 16, lineHeight: 1.65 }}
      />
      <TrustNote />
      <p id="ai-preview-data-note" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.65, color: "var(--text-dim)" }}>Generating sends this summary to SyncedIn and its AI provider and keeps a local prefill for signup in this browser. The preview processes up to {PROFILE_PREVIEW_CONTEXT_LIMIT.toLocaleString("en-US")} characters.</p>
      {dump.trim().length >= 20 && (
        <div
          className="retro-dim"
          style={{ marginTop: 6, fontSize: 11, textAlign: "right" }}
        >
          {dump.length.toLocaleString()} characters in your summary
        </div>
      )}
      <button
        type="button"
        onClick={decode}
        className="retro-btn retro-btn-primary"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "14px 16px",
          fontSize: 16,
          fontWeight: 700, background: "#305ce5", borderRadius: 6, minHeight: 44,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          animation:
            dump.trim().length >= 20 && !reduceMotion
              ? "aikm-glow 1.8s ease infinite"
              : undefined
        }}
      >
        <Sparkles size={18} aria-hidden="true" /> Preview my profile
      </button>
      {err && (
        <div role="alert" style={{ marginTop: 8, fontSize: 13, color: "var(--red, #ef4444)" }}>
          {err}
        </div>
      )}
      <p
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "var(--text-dim)",
          textAlign: "center"
        }}
      >
        Free preview, no account needed. Generation time can vary.
      </p>
    </div>
  );
}

/* ------------------------- presentation bits ------------------------- */

function KeyframeStyles() {
  return (
    <style>{`
      @keyframes aikm-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.55; }
      }
      @keyframes aikm-beam-sweep {
        0% { top: -20%; }
        100% { top: 110%; }
      }
      .aikm-beam {
        position: absolute;
        left: 0;
        right: 0;
        height: 44px;
        pointer-events: none;
        background: linear-gradient(180deg,
          transparent 0%,
          var(--accent-glow, rgba(109,109,248,0.5)) 50%,
          transparent 100%);
        animation: aikm-beam-sweep 1.6s linear infinite;
      }
      @keyframes aikm-progress-slide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(350%); }
      }
      .aikm-progress {
        width: 40%;
        height: 100%;
        border-radius: 2px;
        background: var(--amber, #6d6df8);
        animation: aikm-progress-slide 1.3s ease-in-out infinite;
      }
      @keyframes aikm-card-pop {
        0% { opacity: 0; transform: translateY(18px) scale(0.96); }
        60% { opacity: 1; }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .aikm-card-in {
        animation: aikm-card-pop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.05) both;
      }
      @keyframes aikm-rise-in {
        0% { opacity: 0; transform: translateY(10px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .aikm-rise {
        animation: aikm-rise-in 0.5s ease both;
      }
      @keyframes aikm-caret-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      .aikm-caret {
        animation: aikm-caret-blink 0.8s step-end infinite;
        color: var(--amber-bright);
      }
      @keyframes aikm-glow {
        0%, 100% { box-shadow: 0 0 0 0 var(--accent-glow, rgba(109,109,248,0.5)); }
        50% { box-shadow: 0 0 18px 4px var(--accent-glow, rgba(109,109,248,0.5)); }
      }
      @keyframes aikm-confetti-fly {
        0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
        100% {
          transform: translate(var(--cx), var(--cy)) rotate(var(--cr)) scale(0.4);
          opacity: 0;
        }
      }
      .aikm-confetti {
        position: absolute;
        top: 30px;
        left: 50%;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        pointer-events: none;
        z-index: 60;
        animation: aikm-confetti-fly 2.1s cubic-bezier(0.2, 0.7, 0.4, 1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .aikm-beam, .aikm-progress, .aikm-confetti { animation: none; display: none; }
        .aikm-card-in, .aikm-rise { animation: none; opacity: 1; transform: none; }
      }
    `}</style>
  );
}

const CONFETTI_COLORS = ["#6d6df8", "#9aa0ff", "#d83bff", "#5ee5b2", "#ffd166"];

function ConfettiBurst() {
  // Rendered only on the client after a state change, so Math.random is
  // hydration-safe here.
  const pieces = Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 120 + Math.random() * 160;
    return {
      cx: `${Math.cos(angle) * dist}px`,
      cy: `${Math.sin(angle) * dist * 0.8 - 40}px`,
      cr: `${Math.round(Math.random() * 540 - 270)}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${Math.random() * 0.15}s`
    };
  });
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="aikm-confetti"
          style={
            {
              background: p.color,
              animationDelay: p.delay,
              "--cx": p.cx,
              "--cy": p.cy,
              "--cr": p.cr
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}
