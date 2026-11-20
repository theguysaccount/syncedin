"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  OrbitingPlatformUsers,
  type OrbitUser
} from "../OrbitingPlatformUsers";

/**
 * TalkChat — the streaming-style chat UI for /talk.
 *
 * Layout: 3-column on desktop, single-column stack on mobile.
 *  - LEFT rail:   OrbitingPlatformUsers + "43+ active twins" + recent
 *                 platform members list (real names with portfolio links)
 *  - CENTER:      message scroller + composer (the conversation itself)
 *  - RIGHT rail:  "What Sync is exploring" — live tool-use feed. Every
 *                 search query, scraped profile, and match-preview Sync
 *                 fires lands here as a card so the visitor SEES the
 *                 work happening, even when a search returns nothing.
 *
 * Scroll fix: the outer parent is `height: 100dvh` (not minHeight).
 *  Center column is `display:flex; flex-direction:column; min-height:0`.
 *  Scroller inside the center column gets `flex:1; overflow-y:auto;
 *  min-height:0` — that combo is what lets it actually scroll inside.
 *
 * v1: non-streaming. Reply lands after Claude finishes (~1-3s on Haiku).
 */
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ToolUseSnapshot = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: any;
  ts: number;
};

const EXAMPLE_PROMPTS = [
  "who's on the platform?",
  "anyone like me — I'm a founder doing AI",
  "show me my top 3 matches",
  "how does this work?"
];

/**
 * Fast-start affordances rendered as prominent buttons in the very
 * first turn of /talk. Each pre-fills the composer with a structured
 * request so Sync immediately knows to scrape + match (instead of
 * making the visitor type "my linkedin is ..."). The "open" hint
 * deep-links to the relevant platform so the visitor can copy their
 * handle/URL in one tap.
 */
const FAST_STARTS: Array<{
  label: string;
  emoji: string;
  prompt: string;
  /** Optional deep-link the visitor can tap to copy from. */
  openHref?: string;
  openLabel?: string;
}> = [
  {
    label: "Drop my X handle",
    emoji: "𝕏",
    prompt:
      "My X is @ — match me against the platform from there.",
    openHref: "https://x.com/home",
    openLabel: "open X"
  },
  {
    label: "Drop my LinkedIn URL",
    emoji: "in",
    prompt:
      "My LinkedIn is linkedin.com/in/ — pull my profile and show me my top 3 matches.",
    openHref: "https://www.linkedin.com/in/me/",
    openLabel: "open LinkedIn"
  },
  {
    label: "Drop my Instagram",
    emoji: "📷",
    prompt:
      "My Instagram is @ — match me against the platform.",
    openHref: "https://www.instagram.com/",
    openLabel: "open IG"
  },
  {
    label: "Paste my Personal Intelligence",
    emoji: "✨",
    prompt:
      "Here's a paragraph about me — match me against the platform: \n\n"
  }
];

export function TalkChat({
  orbitUsers,
  totalCount
}: {
  /** Top 15 active platform users with photos — for the orbit + the
   *  "Recently active" left-rail list. */
  orbitUsers: OrbitUser[];
  /** Total active twin count for the "N+ already syncing" pitch. */
  totalCount: number;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "Hey, I'm Sync — the AI that knows everyone on SyncedIn. Ask me who's here, who you should meet, or how the platform works. When you're ready, drop your handle and I'll show you your top 3 matches before you even sign up."
    }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);
  const [toolUses, setToolUses] = useState<ToolUseSnapshot[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the center column on new message / typing state.
  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages.length, busy]);

  async function send(text?: string) {
    const body = (text ?? input).trim();
    if (!body || busy) return;
    setError(null);
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: body
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content }))
        })
      });
      const j = await res.json();
      if (!res.ok || j?.error) {
        setError(j?.detail || j?.error || "Couldn't reach Sync.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: j.reply || "(no reply)"
        }
      ]);
      if (j.signup_url && typeof j.signup_url === "string") {
        setSignupUrl(j.signup_url);
      }
      // Tool-use trace lives in the right rail. Each call gets its own
      // card so the visitor sees real work happening.
      if (j.tool_use_trace && Array.isArray(j.tool_use_trace)) {
        setToolUses((prev) => [
          ...prev,
          ...j.tool_use_trace.map((t: any, i: number) => ({
            id: `tu-${Date.now()}-${i}`,
            name: t.name,
            input: t.input ?? {},
            result: t.result,
            ts: Date.now()
          }))
        ]);
      }
    } catch (e: any) {
      setError(e?.message || "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-clarity-mask="True"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 0,
        minHeight: 0,
        width: "100%",
        maxWidth: 1480,
        margin: "0 auto",
        padding: "0 12px 12px"
      }}
      className="talk-grid"
    >
      {/* ────────── LEFT RAIL ────────── */}
      <aside className="talk-left">
        <div
          style={{
            position: "sticky",
            top: 12,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            paddingTop: 12
          }}
        >
          {orbitUsers.length >= 5 && (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "16px 8px 12px"
              }}
            >
              <OrbitingPlatformUsers
                users={orbitUsers}
                size={260}
                totalCount={totalCount}
                caption="syncing right now"
              />
            </div>
          )}

          {orbitUsers.length > 0 && (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                  marginBottom: 10
                }}
              >
                Recently active
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}
              >
                {orbitUsers.slice(0, 6).map((u) => (
                  <Link
                    key={u.id}
                    href={u.handle ? `/u/${u.handle}` : "#"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textDecoration: "none",
                      color: "inherit",
                      padding: "4px 0"
                    }}
                  >
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.avatar_url}
                        alt={u.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          objectFit: "cover",
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "var(--panel-solid)",
                          flexShrink: 0
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {u.name}
                      </div>
                      {u.achievement && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-dim)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {u.achievement}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ────────── CENTER (the chat) ────────── */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          width: "100%",
          maxWidth: 760,
          margin: "0 auto"
        }}
      >
        {/* SCROLLER */}
        <div
          ref={scrollerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            paddingTop: 20,
            paddingBottom: 16,
            paddingLeft: 4,
            paddingRight: 4,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            minHeight: 0
          }}
        >
          {messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}

          {busy && (
            <div
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 14px",
                background: "var(--panel-solid)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                color: "var(--text-dim)"
              }}
              aria-label="Sync is thinking"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                    opacity: 0.7,
                    animation: `talkDot 1.2s ${i * 0.18}s infinite ease-in-out`
                  }}
                />
              ))}
              <style>{`
                @keyframes talkDot {
                  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
                  30%           { opacity: 1;    transform: translateY(-2px); }
                }
              `}</style>
            </div>
          )}

          {error && (
            <div
              style={{
                alignSelf: "flex-start",
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: 10,
                fontSize: 12,
                color: "#ef4444"
              }}
            >
              {error}
            </div>
          )}

          {signupUrl && (
            <a
              href={signupUrl}
              style={{
                alignSelf: "flex-start",
                padding: "10px 18px",
                borderRadius: 999,
                background:
                  "linear-gradient(135deg, #2358ff 0%, #6b2dc9 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
                boxShadow: "0 8px 24px -8px rgba(31, 139, 255, 0.55)"
              }}
            >
              Sign up — spin up my twin →
            </a>
          )}

          {/* FAST-START AFFORDANCES — only on the first turn. Big
              prominent cards that pre-fill the composer with a
              structured request (so Sync immediately scrapes + matches
              instead of making the visitor figure out what to type),
              PLUS a small "open X / IG / LinkedIn" link inside each
              card to deep-link the visitor to their own profile so
              they can copy the handle in one tap.

              Below the fast-starts: a smaller row of conversational
              example prompts (the original chips) for visitors who'd
              rather just chat than drop a handle. */}
          {messages.length === 1 && !signupUrl && (
            <div
              style={{
                alignSelf: "stretch",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginTop: 6
              }}
            >
              {/* Always-visible Sign Up CTA — Jack: "homepage chat
                  interface should have clickable buttons like Sign
                  Up." */}
              <a
                href="/login?from=talk"
                style={{
                  alignSelf: "stretch",
                  textAlign: "center",
                  padding: "12px 18px",
                  borderRadius: 14,
                  background:
                    "linear-gradient(135deg, #2358ff 0%, #6b2dc9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: "none",
                  boxShadow:
                    "0 8px 24px -8px rgba(31, 139, 255, 0.55)"
                }}
              >
                Sign up — spin up my twin in 30 seconds →
              </a>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                  textAlign: "center"
                }}
              >
                — or watch Sync match you live in 1 tap —
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8
                }}
              >
                {FAST_STARTS.map((fs) => (
                  <div
                    key={fs.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "var(--panel)",
                      cursor: "pointer",
                      transition: "transform 0.1s ease, border-color 0.15s"
                    }}
                    onClick={() => {
                      setInput(fs.prompt);
                      // Don't auto-send — the user needs to fill in
                      // their actual handle / paragraph first. Focus
                      // the textarea so they can type immediately.
                      setTimeout(() => {
                        const ta = document.querySelector(
                          'textarea[placeholder*="Sync"]'
                        ) as HTMLTextAreaElement | null;
                        ta?.focus();
                        // Position cursor at end so they don't have to
                        // manually move past the prefilled prefix.
                        ta?.setSelectionRange(
                          fs.prompt.length,
                          fs.prompt.length
                        );
                      }, 30);
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          fontFamily:
                            '"IBM Plex Mono", ui-monospace, monospace'
                        }}
                      >
                        {fs.emoji}
                      </span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: "var(--text)"
                        }}
                      >
                        {fs.label}
                      </span>
                    </div>
                    {fs.openHref && (
                      <a
                        href={fs.openHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 11,
                          color: "#1f8bff",
                          textDecoration: "none",
                          alignSelf: "flex-start"
                        }}
                      >
                        ↗ {fs.openLabel}
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* Smaller text-only prompt chips for the "just want to
                  chat first" path. */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 2
                }}
              >
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void send(p)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "var(--panel)",
                      color: "var(--text-dim)",
                      cursor: "pointer"
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COMPOSER */}
        <div
          style={{
            flexShrink: 0,
            paddingTop: 10,
            borderTop: "1px solid var(--border)"
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end"
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask Sync anything — or paste your @handle"
              rows={1}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 18,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 15,
                lineHeight: 1.4,
                minHeight: 44,
                maxHeight: 160,
                resize: "none",
                outline: "none",
                fontFamily: "inherit"
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                border: "none",
                background:
                  busy || !input.trim()
                    ? "var(--border)"
                    : "linear-gradient(135deg, #2358ff 0%, #6b2dc9 100%)",
                color: "#fff",
                fontSize: 18,
                cursor: busy || !input.trim() ? "default" : "pointer",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              aria-label="Send"
            >
              ↑
            </button>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--text-dim)",
              textAlign: "center"
            }}
          >
            Free · No signup required to chat with Sync
          </div>
        </div>
      </section>

      {/* ────────── RIGHT RAIL — "Sync is exploring" ────────── */}
      <aside className="talk-right">
        <div
          style={{
            position: "sticky",
            top: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingTop: 12,
            maxHeight: "calc(100dvh - 84px)",
            overflowY: "auto"
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              padding: "0 4px"
            }}
          >
            What Sync is exploring
          </div>

          {toolUses.length === 0 ? (
            <div
              style={{
                background: "var(--panel)",
                border: "1px dashed var(--border)",
                borderRadius: 12,
                padding: 14,
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--text-dim)"
              }}
            >
              Live: every search Sync runs, every profile it pulls, and
              every match it considers lands here as the conversation
              moves. Drop your handle to watch matches surface in real
              time.
            </div>
          ) : (
            toolUses
              .slice()
              .reverse()
              .map((tu) => <ToolCard key={tu.id} tu={tu} />)
          )}

          {/* Steady context card — always visible */}
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text-dim)"
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: 4
              }}
            >
              How matching works
            </div>
            Sync analyses your public profile, compares it against every
            active twin's goals + context, and surfaces the top
            complementarity (not similarity) matches. Sign up to let
            your twin pre-negotiate the intros in the background.
          </div>
        </div>
      </aside>

      {/* Responsive grid — 1 col mobile, 3 col desktop */}
      <style>{`
        .talk-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .talk-left, .talk-right {
          display: none;
        }
        @media (min-width: 1024px) {
          .talk-grid {
            grid-template-columns: 280px minmax(0, 1fr) 320px !important;
            gap: 20px;
            padding: 0 16px 12px !important;
          }
          .talk-left, .talk-right {
            display: block;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const mine = m.role === "user";
  return (
    <div
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "min(86%, 580px)"
      }}
    >
      {!mine && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#1f8bff",
            marginBottom: 3
          }}
        >
          Sync
        </div>
      )}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 18,
          background: mine
            ? "linear-gradient(135deg, #2358ff 0%, #4a3dff 100%)"
            : "var(--panel-solid)",
          color: mine ? "#fff" : "var(--text)",
          border: mine ? "none" : "1px solid var(--border)",
          fontSize: 14.5,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}
      >
        {renderInlineMarkdown(m.content)}
      </div>
    </div>
  );
}

/**
 * ToolCard — renders a single Sync tool call as a right-rail card.
 * Different shapes per tool name so the visitor sees real data, not
 * just JSON.
 */
function ToolCard({ tu }: { tu: ToolUseSnapshot }) {
  const label =
    tu.name === "search_users"
      ? "🔍 Searched"
      : tu.name === "scrape_handle"
      ? "📥 Pulled profile"
      : tu.name === "match_preview"
      ? "✨ Top matches"
      : tu.name === "start_signup"
      ? "🚀 Signup ready"
      : tu.name;

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 12,
        fontSize: 12,
        lineHeight: 1.5
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          fontWeight: 700,
          color: "var(--text)"
        }}
      >
        {label}
      </div>
      <ToolCardBody tu={tu} />
    </div>
  );
}

function ToolCardBody({ tu }: { tu: ToolUseSnapshot }) {
  if (tu.name === "search_users") {
    const matches = (tu.result?.matches as any[]) || [];
    return (
      <div>
        <div
          style={{
            color: "var(--text-dim)",
            fontStyle: "italic",
            marginBottom: 6,
            fontSize: 11
          }}
        >
          &quot;{String((tu.input as any).query ?? "").slice(0, 80)}&quot;
          {tu.result?.fallback && (
            <span style={{ color: "#f59e0b" }}>
              {" "}
              · showing most-active
            </span>
          )}
        </div>
        {matches.length === 0 ? (
          <div style={{ color: "var(--text-dim)" }}>
            No direct matches — Sync is asking another way.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}
          >
            {matches.slice(0, 4).map((m, i) => (
              <MatchRow key={i} m={m} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (tu.name === "match_preview") {
    const matches = (tu.result?.top_matches as any[]) || [];
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        {matches.map((m, i) => (
          <div
            key={i}
            style={{
              borderLeft: "2px solid #1f8bff",
              paddingLeft: 8
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text)" }}>
              {m.name}
            </div>
            {m.one_liner && (
              <div
                style={{
                  color: "var(--text-dim)",
                  fontSize: 11,
                  marginTop: 2
                }}
              >
                {m.one_liner}
              </div>
            )}
            {m.why_sync && (
              <div
                style={{
                  color: "#1f8bff",
                  fontSize: 11,
                  marginTop: 2
                }}
              >
                {m.why_sync}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (tu.name === "scrape_handle") {
    return (
      <div style={{ color: "var(--text-dim)" }}>
        @{String((tu.input as any).handle ?? "")} on{" "}
        {String((tu.input as any).platform ?? "")}
        {tu.result?.note && (
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {String(tu.result.note).slice(0, 140)}
          </div>
        )}
      </div>
    );
  }
  if (tu.name === "start_signup") {
    return (
      <div style={{ color: "var(--text-dim)" }}>
        Signup link prepared — see the CTA in the conversation.
      </div>
    );
  }
  return (
    <pre
      style={{
        fontSize: 10,
        color: "var(--text-dim)",
        whiteSpace: "pre-wrap",
        margin: 0
      }}
    >
      {JSON.stringify(tu.result, null, 2).slice(0, 400)}
    </pre>
  );
}

function MatchRow({ m }: { m: any }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start"
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontWeight: 600,
            color: "var(--text)",
            fontSize: 12
          }}
        >
          {m.name}
          {m.city && (
            <span
              style={{
                color: "var(--text-dim)",
                fontWeight: 400,
                fontSize: 11
              }}
            >
              {" "}
              · {m.city}
            </span>
          )}
        </div>
        {m.one_liner && (
          <div
            style={{
              color: "var(--text-dim)",
              fontSize: 11,
              lineHeight: 1.4,
              marginTop: 2,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden"
            }}
          >
            {m.one_liner}
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny **bold** + `code` renderer so the AI's markdown actually
// formats. Headers / lists pass through as plain text — keep small.
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={`b${k++}`}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code
          key={`c${k++}`}
          style={{
            background: "rgba(120,130,160,0.18)",
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: "0.92em",
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
          }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
