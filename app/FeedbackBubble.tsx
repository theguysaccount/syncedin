"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Global "Give Feedback" bubble — a persistent, customer-support-style
 * launcher in the bottom-right of every page. Jack: "make it so obvious
 * that we are the best at implementing and capturing feedback." The whole
 * platform improves by gathering enough feedback to make finding your
 * intellectual soulmates work for everyone.
 *
 * Posts to /api/feedback/quick (works signed-out too), tagged with the
 * current route so triage knows where the user was. Hidden on the two
 * surfaces that already pin a composer to the bottom (the chat pages), so
 * the bubble never sits on top of the send button.
 */
export function FeedbackBubble() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // Don't overlap the fixed bottom composers on the chat surfaces.
  const hidden =
    /^\/(?:login|dashboard|messages|twin|conversations|settings|onboarding|invite|personal-intelligence|poll|ghosts|continuation|admin)(?:\/|$)/.test(pathname);
  if (hidden) return null;

  async function send() {
    const m = message.trim();
    if (!m) {
      setErr("Type your feedback first.");
      return;
    }
    setSending(true);
    setErr("");
    try {
      const res = await fetch("/api/feedback/quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: m, surface: pathname || "/" })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      setSent(true);
      setMessage("");
    } catch (e: any) {
      setErr(e?.message || "Couldn't send — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 12
      }}
    >
      {open && (
        <div
          className="retro-panel retro-shadow"
          style={{
            width: "min(340px, calc(100vw - 40px))",
            padding: 16,
            borderRadius: 18,
            background: "var(--panel-solid)"
          }}
        >
          {sent ? (
            <div style={{ textAlign: "center", padding: "12px 4px" }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--amber-bright)",
                  marginBottom: 6
                }}
              >
                ✓ Got it — thank you.
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  lineHeight: 1.5,
                  margin: 0
                }}
              >
                Every piece of feedback makes the platform sharper for
                everyone on it. Jack reads them all.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setOpen(false);
                }}
                className="retro-btn"
                style={{ marginTop: 14, fontSize: 13, padding: "8px 16px" }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800 }}>
                  Give feedback
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "var(--text-dim)",
                    fontSize: 16,
                    cursor: "pointer",
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-dim)",
                  lineHeight: 1.45,
                  margin: "0 0 10px"
                }}
              >
                What&apos;s confusing, broken, or missing? We act on it fast.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 3000))}
                rows={4}
                autoFocus
                placeholder="Tell us anything — an idea, a bug, a wish…"
                className="retro-input"
                style={{
                  width: "100%",
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: "vertical",
                  minHeight: 88
                }}
              />
              {err && (
                <div
                  style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}
                >
                  {err}
                </div>
              )}
              <button
                type="button"
                onClick={send}
                disabled={sending || !message.trim()}
                className="retro-btn retro-btn-primary"
                style={{
                  marginTop: 10,
                  width: "100%",
                  fontSize: 14,
                  fontWeight: 800,
                  padding: "10px 16px"
                }}
              >
                {sending ? "sending…" : "Send feedback"}
              </button>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setErr("");
        }}
        aria-label="Give feedback"
        className="fb-launch"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 18px",
          borderRadius: 999,
          border: "none",
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "-0.005em",
          cursor: "pointer",
          background:
            "linear-gradient(135deg, #2358ff 0%, #6b2dc9 60%, #9333ea 100%)"
        }}
      >
        <style>{`
          .fb-launch {
            box-shadow:
              0 0 0 1px rgba(147, 51, 234, 0.55),
              0 10px 30px -6px rgba(107, 45, 201, 0.7),
              0 0 22px rgba(147, 51, 234, 0.55);
            animation: fbGlow 2.8s ease-in-out infinite;
          }
          .fb-launch:hover { transform: translateY(-1px); }
          @keyframes fbGlow {
            0%, 100% {
              box-shadow:
                0 0 0 1px rgba(147, 51, 234, 0.5),
                0 10px 30px -6px rgba(107, 45, 201, 0.6),
                0 0 18px rgba(147, 51, 234, 0.45);
            }
            50% {
              box-shadow:
                0 0 0 1px rgba(147, 51, 234, 0.75),
                0 12px 36px -6px rgba(107, 45, 201, 0.85),
                0 0 34px rgba(147, 51, 234, 0.8);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .fb-launch { animation: none; }
          }
        `}</style>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {open ? "Close" : "Give feedback"}
      </button>
    </div>
  );
}
