"use client";

import { useState } from "react";
import { MicButton } from "../MicButton";
import { Check, X, MessageSquare, LoaderCircle } from "lucide-react";

/**
 * Inline proposal actions on a /messages row — Accept / Deny-with-reason
 * (+ open full messages). Brought over from the removed /proposals page
 * (Jack: "the buttons we had on proposals didn't get moved over to
 * messages — they need to be there"). Posts to /api/respond-agreement;
 * local state drives the UI swap so the server-rendered list doesn't
 * reflow on every action.
 */
export function InlineActions({
  conversationId,
  alreadyAccepted,
  alreadyRejected
}: {
  conversationId: string;
  alreadyAccepted: boolean;
  alreadyRejected: boolean;
}) {
  const [busy, setBusy] = useState<"accept" | "deny" | null>(null);
  const [err, setErr] = useState<string>("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [acceptedJustNow, setAcceptedJustNow] = useState(false);
  const [rejectedJustNow, setRejectedJustNow] = useState(false);

  async function accept() {
    if (busy) return;
    setBusy("accept");
    setErr("");
    try {
      const res = await fetch("/api/respond-agreement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          response: "accepted"
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}) as any);
        throw new Error(j.detail || j.error || `HTTP ${res.status}`);
      }
      setAcceptedJustNow(true);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitDeny() {
    if (busy || !reason.trim()) return;
    setBusy("deny");
    setErr("");
    try {
      const res = await fetch("/api/respond-agreement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          response: "rejected",
          reason: reason.trim()
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}) as any);
        throw new Error(j.detail || j.error || `HTTP ${res.status}`);
      }
      setDenyOpen(false);
      setReason("");
      setRejectedJustNow(true);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  const accepted = alreadyAccepted || acceptedJustNow;
  const rejected = alreadyRejected || rejectedJustNow;

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}
      // Stop row-level navigation when interacting with the actions.
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a
          href={`/conversations/${conversationId}`}
          className="retro-btn text-xs"
          style={{
            padding: "6px 12px",
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4
          }}
        >
          <MessageSquare size={15} aria-hidden="true" />Open messages
        </a>
        {!accepted && (
          <button
            type="button"
            onClick={accept}
            disabled={busy !== null}
            className="retro-btn retro-btn-primary text-xs"
            style={{
              padding: "6px 12px",
              fontWeight: 700,
              opacity: busy ? 0.6 : 1
            }}
          >
            {busy === "accept" ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
            {busy === "accept" ? "Accepting..." : "Accept"}
          </button>
        )}
        {accepted && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              color: "#15803d",
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.30)",
              borderRadius: 999
            }}
          >
            <Check size={15} aria-hidden="true" />Accepted
          </span>
        )}
        {!rejected && (
          <button
            type="button"
            onClick={() => setDenyOpen((v) => !v)}
            disabled={busy !== null}
            className="retro-btn text-xs"
            style={{
              padding: "6px 12px",
              fontWeight: 700,
              color: "#ef4444",
              borderColor: "rgba(239, 68, 68, 0.35)"
            }}
          >
            <X size={15} aria-hidden="true" />{denyOpen ? "Cancel" : "Decline with reason"}
          </button>
        )}
        {rejected && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              color: "#b91c1c",
              background: "rgba(239, 68, 68, 0.10)",
              border: "1px solid rgba(239, 68, 68, 0.30)",
              borderRadius: 999
            }}
          >
            <X size={15} aria-hidden="true" />Declined
          </span>
        )}
      </div>
      {denyOpen && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid rgba(239, 68, 68, 0.35)",
            background: "rgba(239, 68, 68, 0.05)"
          }}
        >
          <label
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#ef4444",
              letterSpacing: "0.04em",
              textTransform: "uppercase"
            }}
          >
            Reason for denial
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              marginTop: 4
            }}
          >
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 600))}
              placeholder="What needs to change for you to accept this? Your twin will regenerate the conversation with this objection in context."
              rows={3}
              className="retro-input"
              style={{ flex: 1, fontSize: 13, padding: 10 }}
            />
            <MicButton
              onText={(chunk) =>
                setReason(
                  (r) => `${r}${r && !r.endsWith(" ") ? " " : ""}${chunk}`
                )
              }
              ariaLabel="Dictate denial reason"
              size={30}
            />
          </div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end"
            }}
          >
            <button
              type="button"
              onClick={() => {
                setDenyOpen(false);
                setReason("");
              }}
              className="retro-btn text-xs"
              style={{ padding: "6px 12px" }}
            >
              cancel
            </button>
            <button
              type="button"
              onClick={submitDeny}
              disabled={!reason.trim() || busy !== null}
              className="retro-btn text-xs"
              style={{
                padding: "6px 12px",
                color: "#fff",
                background: "#ef4444",
                borderColor: "#ef4444"
              }}
            >
              {busy === "deny" ? "submitting…" : "submit denial"}
            </button>
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: "#ef4444" }}>{err}</div>}
    </div>
  );
}
