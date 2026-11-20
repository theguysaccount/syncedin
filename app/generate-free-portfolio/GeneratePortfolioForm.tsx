"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, Sparkles } from "lucide-react";
import { BrandLogo, type BrandKey } from "../BrandLogo";
import { track } from "@/lib/track";
import { TrustNote } from "../TrustNote";
import { PROFILE_PREVIEW_CONTEXT_LIMIT, SHAREABLE_PROFILE_PROMPT } from "@/lib/profile-preview-copy";
import { parseProfilePreview } from "@/lib/profile-preview-result";

/**
 * GeneratePortfolioForm — the conversion engine for the
 * /generate-free-portfolio funnel. Paste personal intelligence → instant
 * portfolio teaser → claim it (sign up). The paste is stashed locally so
 * onboarding prefills the twin + builds the full portfolio.
 */
const SOURCES: { key: BrandKey; label: string }[] = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "perplexity", label: "Perplexity" },
  { key: "grok", label: "Grok" }
];

export function GeneratePortfolioForm() {
  const [name, setName] = useState("");
  const [dump, setDump] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    headline: string;
    about: string;
    highlights: string[];
  } | null>(null);
  const requestInFlight = useRef(false);

  async function generate() {
    if (requestInFlight.current) return;
    if (dump.trim().length < 20) {
      setErr("Paste a bit more about yourself first.");
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    setErr(null);
    track("generate_started", { chars: dump.length });
    try {
      // Stash so signup → onboarding prefills the twin + full portfolio.
      try {
        localStorage.setItem(
          "syncedin-portfolio-seed",
          JSON.stringify({ name, dump })
        );
      } catch {
        /* storage blocked — still works, just no prefill */
      }
      const res = await fetch("/api/portfolio-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, dump })
      });
      const body: unknown = await res.json().catch(() => null);
      const preview = res.ok ? parseProfilePreview(body) : null;
      if (!preview) {
        setErr("Couldn't prepare a complete preview. Your summary is still here; please try again.");
        return;
      }
      setResult(preview);
      track("generate_done", { chars: dump.length });
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }} data-clarity-mask="True">
        <div className="retro-label" style={{ color: "var(--green)" }}>
          Your portfolio draft
        </div>
        <div
          className="retro-panel retro-shadow"
          style={{ marginTop: 12, padding: 24 }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 850,
              letterSpacing: 0, overflowWrap: "anywhere",
              lineHeight: 1.1,
              color: "var(--text)"
            }}
          >
            {name || "Your portfolio"}
          </div>
          {result.headline && (
            <div
              style={{
                marginTop: 8,
                fontSize: 16,
                color: "var(--amber-bright)",
                fontWeight: 700
              }}
            >
              {result.headline}
            </div>
          )}
          {result.about && (
            <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: "var(--text)" }}>
              {result.about}
            </p>
          )}
          {result.highlights.length > 0 && (
            <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.7, color: "var(--text-dim)" }}>
              {result.highlights.map((h, i) => (
                <li key={i} style={{ fontSize: 14 }}>
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
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
          Continue to my portfolio <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <p
          style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}
        >
          Sign in to continue with this draft, then review your profile and
          onboarding choices.
        </p>
        <button
          type="button"
          onClick={() => setResult(null)}
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
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }} data-clarity-mask="True" aria-busy={busy}>
      <label htmlFor="portfolio-preview-name" style={{ display: "block", fontSize: 14, fontWeight: 600 }}>Professional name (optional)</label>
      <input
        id="portfolio-preview-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your professional name"
        className="retro-input"
        style={{ marginTop: 4 }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          margin: "12px 0 6px"
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>
          Optional AI summary:
        </span>
        {SOURCES.map((s) => (
          <span key={s.key} title={s.label} style={{ display: "inline-flex" }}>
            <BrandLogo brand={s.key} size={18} />
          </span>
        ))}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(SHAREABLE_PROFILE_PROMPT);
              setCopied(true);
              track("prompt_copied");
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="retro-btn text-xs"
          style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, borderRadius: 6 }}
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? "Prompt copied" : "Copy prompt"}
        </button>
      </div>
      <label htmlFor="portfolio-preview-context" style={{ display: "block", marginTop: 12, marginBottom: 6, fontSize: 14, fontWeight: 600 }}>Professional summary</label>
      <textarea
        id="portfolio-preview-context"
        aria-describedby="portfolio-preview-data-note"
        value={dump}
        onChange={(e) => setDump(e.target.value)}
        rows={7}
        placeholder="Your role, current work, accurate examples, and what you want to explore. Use only information you are comfortable sharing."
        className="retro-input"
        style={{ fontSize: 16, lineHeight: 1.65 }}
      />
      <TrustNote />
      <p id="portfolio-preview-data-note" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.65, color: "var(--text-dim)" }}>Generating sends this summary to SyncedIn and its AI provider and keeps a local prefill for signup in this browser. The preview processes up to {PROFILE_PREVIEW_CONTEXT_LIMIT.toLocaleString("en-US")} characters.</p>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="retro-btn retro-btn-primary"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "14px 16px",
          fontSize: 16,
          fontWeight: 700, background: "#305ce5", borderRadius: 6, minHeight: 44,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {busy ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
        {busy ? "Preparing preview..." : "Generate my preview"}
      </button>
      {err && (
        <div role="alert" style={{ marginTop: 8, fontSize: 13, color: "var(--red, #ef4444)" }}>
          {err}
        </div>
      )}
      <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>
        Free preview, no account needed. Generation time can vary.
      </p>
    </div>
  );
}
