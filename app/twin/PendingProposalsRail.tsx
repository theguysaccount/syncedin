"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Brain, Target, Handshake, Pencil, ChartNoAxesColumn, Users, Mail, MessageSquare, ChevronDown, ChevronRight, ArrowRight, Check } from "lucide-react";

/**
 * PendingProposalsRail — desktop right-rail on /twin showing the user's
 * pending proposals with one-click Accept / Deny buttons.
 *
 * Pulls /api/twin/proposals on mount + every 30s. Accept/Deny POST
 * /api/respond-agreement and on success remove the card from the list
 * (optimistic) + re-fetch.
 *
 * The twin chat references these by counterpart name ("look at the
 * Tejas card to your right") so the twin can actually direct action
 * instead of saying "I can't, copy-paste yourself".
 */
type Proposal = {
  conversation_id: string;
  counterpart_id: string;
  counterpart_name: string;
  counterpart_avatar: string | null;
  counterpart_handle: string | null;
  summary: string;
  counterpart_summary: string;
  created_at: string;
};

export function PendingProposalsRail() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [denyOpen, setDenyOpen] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default per Jack: rail should be a small "▶ N pending"
  // header that expands on click. Avoids stacking 6 huge cards and
  // duplicating what the twin will surface inline once tool-use lands.
  const [expanded, setExpanded] = useState(false);
  const [quickOpen, setQuickOpen] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const sync = () => setQuickOpen(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/twin/proposals", {
        cache: "no-store"
      });
      const j = await res.json();
      if (!res.ok) throw new Error("Your proposals could not be loaded. Please try again.");
      setProposals(((j?.proposals as Proposal[]) ?? []).slice(0, 12));
      setError(current => current === "Your proposals could not be loaded. Please try again." ? null : current);
    } catch {
      setError("Your proposals could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const i = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(i);
  }, [load]);

  async function accept(p: Proposal) {
    if (acting) return;
    setActing(p.conversation_id);
    setError(null);
    try {
      const res = await fetch("/api/respond-agreement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: p.conversation_id,
          response: "accepted"
        })
      });
      if (!res.ok) throw new Error("The proposal was not accepted. Please try again.");
      setProposals(prev => prev.filter(x => x.conversation_id !== p.conversation_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The proposal was not accepted. Please try again.");
    } finally {
      setActing(null);
      void load();
    }
  }

  async function deny(p: Proposal) {
    if (acting) return;
    setActing(p.conversation_id);
    setError(null);
    try {
      const res = await fetch("/api/respond-agreement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: p.conversation_id,
          response: "rejected",
          reason: denyReason.trim() || null
        })
      });
      if (!res.ok) throw new Error("The proposal was not declined. Please try again.");
      setProposals(prev => prev.filter(x => x.conversation_id !== p.conversation_id));
      setDenyOpen(null);
      setDenyReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The proposal was not declined. Please try again.");
    } finally {
      setActing(null);
      void load();
    }
  }

  return (
    <aside
      className="twin-actions-rail"
      style={{
        position: "sticky",
        top: 12,
        maxHeight: "calc(100dvh - 100px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}
    >
      {/* Collapsible header. Click anywhere on the row to toggle.
          Shows "▶ 3 pending proposals" by default — expand to see
          full Accept/Deny cards. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
      <button
        className="proposal-toggle"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          background: "var(--panel-solid)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          minHeight: 44,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          flex: 1
        }}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse proposals" : "Expand proposals"}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text)"
          }}
        >
          {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          {loading
            ? "Loading proposals…"
            : error && proposals.length === 0
            ? "Proposals unavailable"
            : proposals.length === 0
            ? "Inbox clear"
            : `${proposals.length} pending proposal${
                proposals.length === 1 ? "" : "s"
              }`}
        </span>
      </button>
        <Link
          href="/messages"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            minHeight: 44,
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 600
          }}
        >
          All <ArrowRight size={13} aria-hidden="true" className="inline" />
        </Link>
      </div>
      {error && <p role="alert" className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}

      {!expanded || (error && proposals.length === 0) ? null : loading ? (
        <div
          style={{
            padding: 12,
            color: "var(--text-dim)",
            fontSize: 12
          }}
        >
          Loading…
        </div>
      ) : proposals.length === 0 ? (
        <div
          style={{
            background: "var(--panel)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            padding: 14,
            fontSize: 13,
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
            Inbox clear.
          </div>
          When your twin lands a deal in a conversation, Accept / Deny
          shows up here so you can move without leaving this page.
        </div>
      ) : (
        proposals.map((p) => (
          <div
            key={p.conversation_id}
            style={{
              background: "var(--panel-solid)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8
              }}
            >
              {p.counterpart_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.counterpart_avatar}
                  alt={p.counterpart_name}
                  referrerPolicy="no-referrer"
                  loading="lazy"
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
                    background: "var(--panel)",
                    flexShrink: 0
                  }}
                />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {p.counterpart_handle ? (
                    <Link
                      href={`/u/${p.counterpart_handle}`}
                      style={{
                        color: "inherit",
                        textDecoration: "none"
                      }}
                    >
                      {p.counterpart_name}
                    </Link>
                  ) : (
                    p.counterpart_name
                  )}
                </div>
              </div>
              <Link
                href={`/conversations/${p.conversation_id}`}
                title="Open conversation"
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  textDecoration: "none",
                  flexShrink: 0
                }}
              >
                Open ↗
              </Link>
            </div>

            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.45,
                color: "var(--text)",
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden"
              }}
            >
              {p.summary || "(no summary)"}
            </div>

            {denyOpen === p.conversation_id ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}
              >
                <textarea
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Why deny? (optional — twin uses this for next round)"
                  rows={2}
                  style={{
                    fontSize: 12,
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    resize: "vertical",
                    fontFamily: "inherit"
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setDenyOpen(null);
                      setDenyReason("");
                    }}
                    style={btnGhost}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void deny(p)}
                    disabled={acting === p.conversation_id}
                    style={btnDangerSolid}
                  >
                    Confirm deny
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void accept(p)}
                  disabled={acting === p.conversation_id}
                  style={btnAcceptSolid}
                >
                  <Check size={15} aria-hidden="true" />Accept
                </button>
                <button
                  type="button"
                  onClick={() => setDenyOpen(p.conversation_id)}
                  disabled={acting === p.conversation_id}
                  style={btnGhost}
                >
                  Deny
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {/* Quick Actions — always-on shortcuts. Keeps the right rail
          full of value even when proposals are clear. */}
      <details className="twin-quick-actions" open={quickOpen} onToggle={event => setQuickOpen(event.currentTarget.open)}>
        <summary><span>Quick actions</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="twin-quick-action-list">
        {/* These fire prompts INTO the chat (not nav links — the menu
            already covers navigation). Each maps to something the twin can
            actually do with its tools: update context, find matches, triage,
            sharpen its voice, read poll consensus. */}
        {[
          {
            Icon: Brain,
            label: "Add context to my twin",
            prompt:
              "I want to add something to my twin's context. Ask me what to add, then stage the update for me to approve."
          },
          {
            Icon: Target,
            label: "Find my best match",
            prompt:
              "Who on the platform is my highest-leverage match right now, and why? Search and show me the top few."
          },
          {
            Icon: Handshake,
            label: "Triage my proposals",
            prompt:
              "Triage my pending proposals: which should I accept, counter, or deny, and why? Stage the actions."
          },
          {
            Icon: Pencil,
            label: "Sharpen my twin's voice",
            prompt:
              "Critique how my twin currently sounds and suggest 3 concrete edits to make it more like me."
          },
          {
            Icon: ChartNoAxesColumn,
            label: "My poll consensus",
            prompt: "What did the network conclude on my polls? Summarize the results."
          },
          {
            Icon: Users,
            label: "Who to reach out to today",
            prompt: "Who are the 3 people I should reach out to today, and what should I say?"
          },
          {
            Icon: Mail,
            label: "Invite someone",
            prompt:
              "I want to invite someone to SyncedIn. Ask me for their name and a profile link, email, or handle, then create the invite."
          },
          {
            Icon: MessageSquare,
            label: "Give feedback",
            prompt:
              "I want to give the team product feedback. Ask me what it is, then submit it for me."
          }
        ].map((a) => (
          <button
            className="twin-quick-action"
            key={a.label}
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("twin-quick-prompt", { detail: a.prompt })
              )
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 8px",
              minHeight: 44,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 500,
              width: "100%",
            }}
          >
            <a.Icon size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
            {a.label}
          </button>
        ))}
        </div>
      </details>

    </aside>
  );
}

const btnAcceptSolid: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  flex: 1,
  minHeight: 44,
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  background: "#146c55",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer"
};
const btnDangerSolid: React.CSSProperties = {
  flex: 1,
  minHeight: 44,
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  background: "#ef4444",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer"
};
const btnGhost: React.CSSProperties = {
  flex: "0 0 auto",
  minHeight: 44,
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-dim)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer"
};
