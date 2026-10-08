"use client";

import { useEffect, useState } from "react";
import { BrandLogo, type BrandKey } from "../BrandLogo";

/**
 * Multi-source AI export uploader. Per Jack: "I use Claude AND ChatGPT
 * every day for months — both have huge depth on me, integrating BOTH
 * (not just one) is a massive twin-quality unlock. This integration
 * is king."
 *
 * Each user gets one row per source so they can paste a deep self-
 * description from each AI tool. Each section has its own platform-
 * tuned prompt (what to ASK that tool that it'd uniquely know about
 * them).
 *
 * Persists to /api/ai-exports (one row per user+source, upsert).
 * Mounted on /onboarding so it shows up as part of the twin-build flow.
 */

type Source = {
  key: "chatgpt" | "claude" | "gemini" | "perplexity" | "grok";
  label: string;
  brand: BrandKey;
  prompt: string;
};

// King-level twin context. Each prompt is engineered to extract
// deal-actionable self-descriptions — NOT "personality bios."
// The shared backbone is the same across platforms (every section gets
// the full structured drill-down) with platform-specific phrasing so each
// AI is nudged to lean into the slice of you it knows best.
//
// Hard rules baked into every prompt:
//  - NO word-count limits, floor, or ceiling (Jack: "let it give us as
//    much as it feels it needs"). The prompt asks for max depth and
//    trusts the model to surface everything it has.
//  - Drops "personality/humor" sections entirely — Jack: "Asking what I
//    find funny doesn't matter."
//  - Heavy weighting on projects, intros, deals, collabs (the levers a
//    twin can actually pull in a real conversation)
//  - First-person, concrete, names companies/people/dollar amounts where
//    relevant
//  - No bestseller-style filler ("I'm a builder who...") — surgical detail
const SHARED_OUTLINE = `You are writing the dossier my digital twin will use to represent me in real conversations with strangers. Tone: surgical, first-person, zero filler. NEVER write generic "personality" descriptions — skip what I find funny, skip hobbies, skip MBTI. The twin needs ammunition, not vibes.

Length: write as much as you need. There is no minimum and no maximum — go deep on every section you actually have signal on, and skim only the sections where you genuinely have nothing. Use headers + bullets liberally. Be the most specific you have ever been.

Required sections (in order):

1. EVERYTHING I AM WORKING ON RIGHT NOW.
   List every project, company, venture, side-bet, fund, podcast, course, app, fork — name them by name. For each: (a) what stage it's at this week, (b) what's the current bottleneck, (c) what would move it forward, (d) who else is involved by name.

2. THE EXACT INTROS THAT WOULD MOVE THE NEEDLE.
   Not "investors" — name the SHAPE of investor (stage, check size, sector thesis), the SHAPE of operator (function, prior company DNA), or by literal name if I've mentioned wanting to meet them. For each intro target, write one sentence of WHY them specifically, and one sentence of WHAT I would say in the first message.

3. DEAL STRUCTURES I WILL DO AND WON'T DO.
   Term sheets, equity splits, advisor grants, revenue share, retainers — what I have agreed to before and at what numbers. What I have walked away from. What the floor / ceiling is on each. What signal makes me say yes fast vs. ghost.

4. COLLABORATIONS THAT WOULD ACTUALLY MOVE THINGS.
   Not "I love to collab!" — describe the specific 3-5 partnership shapes that compound my current work. For each: which of my projects it plugs into, what the other side gets, what the first 30 days look like.

5. CONCRETE RECENT WINS — WITH DETAILS.
   What I've actually shipped, raised, sold, hired, recruited in the last 6-12 months. Names. Numbers. Specifics another founder would recognize as credible. Avoid vagueness — replace "scaled a SaaS" with "took ARR from $40K to $1.2M MRR in 11 months with a 3-person team."

6. WHAT I HAVE THAT I CAN GIVE.
   The other side of the bait — what I can offer the network this quarter. Warm intros (be specific about who), unused budget, advisory hours, distribution, audience, code, designs, office space, anything.

7. THE THINGS YOU MUST NEVER LET MY TWIN DO.
   Hard nos. Behaviors / topics / categories of ask that should trigger instant decline. Past mistakes you've watched me make that I'd want auto-blocked.

8. THE THINGS I CARE ABOUT THIS QUARTER.
   The 3-5 outcomes that, if achieved, would mean the next 90 days were a win. Specific enough to measure.

DO NOT output any preamble. Start with the first heading. Use my own phrasing where you've heard it. End when you've covered all 8 sections in depth.`;

const SOURCES: Source[] = [
  {
    key: "chatgpt",
    label: "ChatGPT",
    brand: "chatgpt",
    prompt: `Based on EVERY conversation we have ever had — including code, brainstorms, drafts, decisions, doubts, rants — produce the full dossier below. ChatGPT, you've watched me iterate on the actual work. Lean into the operational detail you've seen me sweat.

${SHARED_OUTLINE}`
  },
  {
    key: "claude",
    label: "Claude",
    brand: "claude",
    prompt: `Across the whole arc of our conversations, write the full dossier below. Claude, you've been my long-form thinking partner — lean into strategy, second-order effects, and the specific deals / pitches / drafts we've talked through. Don't summarize — pull the receipts.

${SHARED_OUTLINE}`
  },
  {
    key: "gemini",
    label: "Gemini",
    brand: "gemini",
    prompt: `Based on our chat history and anything you know about me from Google services I've connected, produce the full dossier below. Gemini, lean into anything cross-referenced from my Drive, Calendar, or research sessions you can recall.

${SHARED_OUTLINE}`
  },
  {
    key: "perplexity",
    label: "Perplexity",
    brand: "perplexity",
    prompt: `From every conversation + every research thread I've run with you, write the full dossier below. Perplexity, you've been the research arm — surface the specific market context, named competitors, named people I've asked you to look up, and any data points you've pulled for me that the twin should know.

${SHARED_OUTLINE}`
  },
  {
    key: "grok",
    label: "Grok",
    brand: "grok",
    prompt: `Based on everything I've talked to you about — including anything you've pulled from my X timeline / replies / DMs / following graph — produce the full dossier below. Grok, lean into the social-graph + real-time signal layer the other AIs don't see: who I've been engaging with, what I've been posting about, what's trending in my circle.

${SHARED_OUTLINE}`
  }
];

export function AiExportsPanel() {
  const [openKey, setOpenKey] = useState<Source["key"] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-exports");
        const j = await res.json();
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const e of (j.exports ?? []) as any[]) {
          if (typeof e.source === "string" && typeof e.content === "string") {
            next[e.source] = e.content;
          }
        }
        setValues(next);
      } catch {
        /* offline / unauthed — start empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyPrompt(source: Source) {
    try {
      await navigator.clipboard.writeText(source.prompt);
      setCopied(source.key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy this prompt:", source.prompt);
    }
  }

  async function save(key: Source["key"], content: string) {
    if (!content.trim()) return;
    try {
      const res = await fetch("/api/ai-exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: key, content })
      });
      if (res.ok) {
        setSavedAt((s) => ({ ...s, [key]: Date.now() }));
      }
    } catch {
      /* non-fatal — user can retry */
    }
  }

  const totalConnected = Object.values(values).filter(
    (v) => v && v.trim().length > 0
  ).length;

  return (
    <section
      style={{
        padding: 18,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--panel-solid)"
      }}
    >
      <style>{`
        .aiex-tile {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          background: var(--panel-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .aiex-tile:hover { border-color: #1f8bff; }
        .aiex-tile.has-data { border-color: rgba(34, 197, 94, 0.45); }
        .aiex-tile-left {
          display: flex; align-items: center; gap: 10px;
          font-weight: 700; font-size: 14px;
        }
        .aiex-tile-right {
          font-size: 11px; color: var(--text-dim); letter-spacing: 0.04em;
        }
        .aiex-tile.has-data .aiex-tile-right {
          color: #15803d; font-weight: 700;
        }
        .aiex-panel {
          padding: 14px;
          margin-top: -2px;
          margin-bottom: 10px;
          background: var(--panel-2);
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .aiex-prompt {
          padding: 10px 12px;
          background: var(--panel-solid);
          border: 1px dashed var(--border-bright);
          border-radius: 8px;
          font-family: ui-monospace, SF Mono, Menlo, monospace;
          font-size: 12px;
          line-height: 1.5;
          color: var(--text);
          max-height: 160px;
          overflow-y: auto;
          white-space: pre-wrap;
        }
        .aiex-copy {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; font-size: 12px; font-weight: 700;
          border-radius: 8px;
          background: rgba(31, 139, 255, 0.10);
          color: #1f8bff;
          border: 1px solid rgba(31, 139, 255, 0.30);
          cursor: pointer; margin-top: 8px;
        }
        .aiex-copy.copied {
          background: rgba(34, 197, 94, 0.10);
          color: #15803d;
          border-color: rgba(34, 197, 94, 0.30);
        }
      `}</style>

      <header style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#1f8bff"
          }}
        >
          king-level twin context
        </div>
        <h3
          style={{
            margin: "4px 0 6px",
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: "-0.005em"
          }}
        >
          Connect your AI tools — each one knows you differently
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-dim)",
            lineHeight: 1.5,
            margin: 0
          }}
        >
          You probably use ChatGPT, Claude, and others daily. Each has
          a different slice of who you are. Pull that depth into your
          twin so it can actually represent you.{" "}
          <strong style={{ color: "var(--text)" }}>
            {totalConnected} of {SOURCES.length} connected.
          </strong>
        </p>
      </header>

      {SOURCES.map((source) => {
        const isOpen = openKey === source.key;
        const value = values[source.key] || "";
        const hasData = value.trim().length > 0;
        return (
          <div key={source.key}>
            <div
              className={`aiex-tile ${hasData ? "has-data" : ""}`}
              onClick={() =>
                setOpenKey((k) => (k === source.key ? null : source.key))
              }
            >
              <div className="aiex-tile-left">
                <BrandLogo brand={source.brand} size={18} />
                <span>{source.label}</span>
              </div>
              <span className="aiex-tile-right">
                {hasData
                  ? `✓ ${value.length.toLocaleString()} chars`
                  : isOpen
                    ? "open"
                    : "add"}
              </span>
            </div>
            {isOpen && (
              <div className="aiex-panel">
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginBottom: 6,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontWeight: 700
                  }}
                >
                  Step 1 — copy this prompt into {source.label}
                </div>
                <div className="aiex-prompt">{source.prompt}</div>
                <button
                  type="button"
                  onClick={() => copyPrompt(source)}
                  className={`aiex-copy ${copied === source.key ? "copied" : ""}`}
                >
                  {copied === source.key ? "✓ copied" : "⧉ copy prompt"}
                </button>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginTop: 14,
                    marginBottom: 6,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontWeight: 700
                  }}
                >
                  Step 2 — paste {source.label}&apos;s response here
                </div>
                <textarea
                  value={value}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 60_000);
                    setValues((s) => ({ ...s, [source.key]: next }));
                  }}
                  onBlur={() => save(source.key, value)}
                  rows={8}
                  placeholder={`Paste ${source.label}'s response here. Auto-saves on blur.`}
                  className="retro-input"
                  style={{
                    width: "100%",
                    fontSize: 13.5,
                    padding: 10,
                    minHeight: 140
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 6
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)"
                    }}
                  >
                    {value.length.toLocaleString()} / 60,000
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: savedAt[source.key] ? "#15803d" : "var(--text-dim)"
                    }}
                  >
                    {savedAt[source.key] ? "saved ✓" : ""}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {loading && (
        <div
          aria-label="Loading saved exports"
          style={{ marginTop: 8, display: "grid", gap: 8 }}
        >
          {[0, 1].map((i) => (
            <div
              key={i}
              className="ob-skeleton"
              style={{ height: 44, borderRadius: 10 }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
