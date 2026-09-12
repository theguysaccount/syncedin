"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Bottom-of-dashboard feedback capture. Type a quick title + body, fire
 * it off — it lands on the public /feedback page as a real post that
 * everyone can upvote. The point is to lower the friction for Jack-style
 * real-time bug reports while he's mid-flow on the app, without
 * fragmenting feedback into a separate private inbox.
 *
 * Uses retro-input + retro-panel theming so it adapts to light/dark
 * automatically (the previous version hard-coded a dark rgba background
 * which rendered as a flat gray rectangle in light mode — what Jack
 * called out in the screenshot).
 */
export function QuickFeedbackWidget({
  surface = "dashboard"
}: {
  surface?: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<"idea" | "bug" | "feature" | "other">(
    "idea"
  );
  const [submitting, setSubmitting] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");

  async function submit() {
    const t = title.trim();
    if (!t) {
      setErr("Add a quick one-line summary first.");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      // Prepend the surface tag onto the body so we can still tell
      // which page the post came from when triaging.
      const bodyWithSurface = body.trim()
        ? `${body.trim()}\n\n---\nsubmitted from: ${surface}`
        : `(submitted from ${surface})`;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: t,
          body: bodyWithSurface,
          category
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.detail || j.error || `HTTP ${res.status}`);
      }
      setSentId(j.id ?? "");
      setTitle("");
      setBody("");
      setCategory("idea");
    } catch (e: any) {
      setErr(e?.message || "Couldn't send. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="retro-panel"
      style={{
        marginTop: 40,
        padding: 24,
        borderRadius: 22
      }}
    >
      <style>{`
        .qfw-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .qfw-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.005em;
        }
        .qfw-feedback-link {
          font-size: 12px;
          font-weight: 700;
          color: var(--amber-bright);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .qfw-sub {
          font-size: 13px;
          color: var(--text-dim);
          margin: 2px 0 16px;
          line-height: 1.5;
        }
        .qfw-cat-row {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
          padding: 4px;
          background: var(--panel-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          margin-bottom: 12px;
        }
        .qfw-cat {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 7px;
          background: transparent;
          color: var(--text-dim);
          border: 0;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: background 0.15s, color 0.15s;
        }
        .qfw-cat.active {
          background: var(--panel-solid);
          color: var(--text);
          box-shadow: 0 1px 0 var(--border);
        }
        .qfw-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          flex-wrap: wrap;
        }
        .qfw-send {
          padding: 11px 18px;
          font-size: 14px;
          font-weight: 800;
          border-radius: 10px;
        }
        .qfw-thanks {
          padding: 22px;
          text-align: center;
        }
        .qfw-thanks h4 {
          font-size: 18px;
          font-weight: 800;
          margin: 0 0 6px;
          color: var(--amber-bright);
        }
        .qfw-thanks p {
          font-size: 13px;
          color: var(--text-dim);
          line-height: 1.5;
          margin: 0 auto;
          max-width: 460px;
        }
        .qfw-thanks-actions {
          margin-top: 16px;
          display: inline-flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .qfw-err {
          font-size: 12px;
          color: #ef4444;
          margin-top: 8px;
        }
      `}</style>

      {sentId !== null ? (
        <div className="qfw-thanks">
          <h4>✓ Got it, thank you.</h4>
          <p>
            Your post is live on the public feedback board. Jack reads
            every one. Vote up the ones that matter most to you and
            keep an eye on the build notes when they ship.
          </p>
          <div className="qfw-thanks-actions">
            <Link
              href="/feedback"
              className="retro-btn retro-btn-primary"
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              See it on the feedback board →
            </Link>
            <button
              type="button"
              onClick={() => setSentId(null)}
              className="retro-btn"
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              Send another
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="qfw-header">
            <div className="qfw-title">Tell us what&apos;s broken or missing</div>
            <Link href="/feedback" className="qfw-feedback-link">
              See all feedback →
            </Link>
          </div>
          <p className="qfw-sub">
            Posts go to the public board at{" "}
            <Link
              href="/feedback"
              style={{ textDecoration: "underline" }}
            >
              /feedback
            </Link>
            . Everyone can vote, Jack reads every one.
          </p>

          <div className="qfw-cat-row">
            {(["idea", "bug", "feature", "other"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`qfw-cat ${category === c ? "active" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 160))}
            placeholder="One-line summary: what's confusing or missing?"
            className="retro-input"
            style={{ fontSize: 15 }}
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 3000))}
            rows={4}
            placeholder="Optional: more detail, steps to reproduce, what you'd love to see instead…"
            className="retro-input"
            style={{
              marginTop: 10,
              minHeight: 96,
              fontSize: 14,
              lineHeight: 1.5,
              resize: "vertical",
              fontFamily: "inherit"
            }}
          />

          {err && <div className="qfw-err">{err}</div>}

          <div className="qfw-actions">
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !title.trim()}
              className="retro-btn retro-btn-primary qfw-send"
            >
              {submitting ? "posting…" : "post to feedback board"}
            </button>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Tagged{" "}
              <code style={{ fontSize: 11 }}>{surface}</code> for triage.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
