"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";

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
    /^\/(?:agent|login|dashboard|messages|twin|conversations|settings|onboarding|invite|personal-intelligence|poll|ghosts|continuation|admin)(?:\/|$)/.test(
      pathname,
    );
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
        body: JSON.stringify({ message: m, surface: pathname || "/" }),
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
      className="feedback-bubble"
      style={{
        position: "fixed",
        right: 20,
        bottom:
          "calc(var(--feedback-bottom-offset, 20px) + env(safe-area-inset-bottom, 0px))",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 12,
      }}
    >
      {open && (
        <div
          id="feedback-composer"
          className="retro-panel retro-shadow"
          style={{
            width: "min(340px, calc(100vw - 40px))",
            padding: 16,
            borderRadius: 18,
            background: "var(--panel-solid)",
          }}
        >
          {sent ? (
            <div style={{ textAlign: "center", padding: "12px 4px" }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--amber-bright)",
                  marginBottom: 6,
                }}
              >
                ✓ Got it — thank you.
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Every piece of feedback makes the platform sharper for everyone
                on it. Jack reads them all.
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
                  marginBottom: 4,
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
                    lineHeight: 1,
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-dim)",
                  lineHeight: 1.45,
                  margin: "0 0 10px",
                }}
              >
                What&apos;s confusing, broken, or missing? We act on it fast.
              </p>
              <textarea
                aria-label="Your feedback"
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
                  minHeight: 88,
                }}
              />
              {err && (
                <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>
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
                  padding: "10px 16px",
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
        aria-expanded={open}
        aria-controls="feedback-composer"
        className="fb-launch"
      >
        {open ? (
          <X size={18} aria-hidden="true" />
        ) : (
          <MessageSquare size={18} aria-hidden="true" />
        )}
        <span>{open ? "Close" : "Give feedback"}</span>
      </button>
    </div>
  );
}
