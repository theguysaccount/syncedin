"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Users, Pencil, Target, Inbox, Handshake, Search, Send, LoaderCircle } from "lucide-react";

/**
 * Internal slash-routes the twin commonly references in copy. When the
 * assistant says "verify on /proposals" we want that to render as a
 * real link the user can click. Whitelist approach so we don't turn
 * incidental "use /n for newline" into bad nav.
 */
const TWIN_INTERNAL_PATHS = new Set([
  "/dashboard",
  "/messages",
  "/twin",
  "/talk",
  "/invite",
  "/poll",
  "/personal-intelligence",
  "/settings",
  "/hypernetwork",
  "/feedback",
  "/conversations"
]);

type PendingAction = {
  id: string;
  type:
    | "update_proposal_text"
    | "accept_proposal"
    | "deny_proposal"
    | "send_message_to_conversation"
    | "update_twin_context"
    | "create_invite"
    | "submit_feedback"
    | "start_conversation";
  payload: Record<string, any>;
  /** Set true once the user has approved + the write succeeded. Persisted
   *  back into the message trailer so a reload doesn't re-prompt Approve
   *  for an action that already ran. */
  executed?: boolean;
};

type ChatRow = {
  id: string;
  role: "user" | "assistant";
  body: string;
  created_at?: string | null;
  /** When the twin staged write actions, render these as inline
   *  Approve cards under the bubble. */
  pending_actions?: PendingAction[];
};

/**
 * Strip the persisted <!--PENDING_ACTIONS:[...]--> trailer from a
 * stored assistant message + return both the visible body and the
 * parsed actions. Lets actions survive a page reload.
 */
function splitPendingActions(body: string): {
  body: string;
  actions: PendingAction[];
} {
  // The model has emitted malformed marker variants — missing the `-->`
  // close, a stray trailing `→`, no leading blank line, trailing
  // whitespace. The old strict regex (required `\n\n` … `-->` … end-of-
  // string) matched NONE of those, so the raw marker rendered as visible
  // text AND every Approve card was dropped (so accepts couldn't register).
  // Robust approach: (a) always strip from the marker onward so it never
  // shows, and (b) recover the actions by bracket-balancing the JSON array
  // even when the wrapper is malformed.
  const start = body.search(/<!--\s*PENDING_ACTIONS\s*:/i);
  if (start === -1) return { body, actions: [] };

  const cleanBody = body.slice(0, start).trimEnd();
  let actions: PendingAction[] = [];

  const arrStart = body.indexOf("[", start);
  if (arrStart !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = arrStart; i < body.length; i++) {
      const ch = body[i];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(body.slice(arrStart, end + 1));
        if (Array.isArray(parsed)) actions = parsed as PendingAction[];
      } catch {
        /* malformed JSON — marker still stripped above */
      }
    }
  }
  return { body: cleanBody, actions };
}

/**
 * Tiny inline markdown renderer for twin chat bubbles.
 *
 * Jack: "it's got the kind of like bold asterisks that it's not
 * formatted properly. Let's turn that into bold text."
 *
 * Handles per-line:
 *   - `---` horizontal rule
 *   - `- ` bullet (joined into a <ul>)
 *   - `N. ` numbered list (joined into a <ol>)
 *   - Inline: **bold**, *italic*, `code`
 *
 * Deliberately small — no full markdown parser, no XSS surface beyond
 * what React's JSX escapes for free. Edit-mode shows raw text so users
 * still see the asterisks when they tap to edit.
 */
function renderInlineMd(text: string): React.ReactNode[] {
  // Tokenize **bold**, *italic*, `code` in one pass. Greedy match for
  // bold first (so "**foo**" doesn't get eaten as two italics).
  const out: React.ReactNode[] = [];
  // Token order matters: bold > italic > code > internal-slash-path.
  // The slash-path token requires the slash to be at a word boundary
  // (start-of-string or after whitespace / punctuation) so we don't
  // turn "a/b" or "foo/bar" inside regular text into a fake link.
  const re =
    /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|(?:^|(?<=[\s(\[]))\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const tok = match[0];
    if (tok.startsWith("**") && tok.endsWith("**")) {
      out.push(<strong key={`b${key++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*") && tok.endsWith("*")) {
      out.push(<em key={`i${key++}`}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("/")) {
      // Internal slash-path → render as Link if it's a known app route.
      // We strip a trailing /[id] segment when checking the whitelist so
      // /conversations/abc123 still autolinks. Unknown paths fall through
      // as plain text so we don't break unrelated copy.
      const root = "/" + tok.slice(1).split("/")[0];
      if (TWIN_INTERNAL_PATHS.has(root)) {
        out.push(
          <Link
            key={`a${key++}`}
            href={tok}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: "var(--blue, #2358ff)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontWeight: 600
            }}
          >
            {tok}
          </Link>
        );
      } else {
        out.push(tok);
      }
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      out.push(
        <code
          key={`c${key++}`}
          style={{
            background: "rgba(120, 130, 160, 0.18)",
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: "0.92em",
            fontFamily:
              '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace'
          }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + tok.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function renderMarkdown(body: string): React.ReactNode {
  const lines = body.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    // Horizontal rule
    if (/^-{3,}$/.test(trimmed) || /^={3,}$/.test(trimmed)) {
      blocks.push(
        <hr
          key={`hr${blockKey++}`}
          style={{
            border: 0,
            borderTop: "1px solid var(--border, rgba(0,0,0,0.12))",
            margin: "8px 0"
          }}
        />
      );
      i++;
      continue;
    }
    // Bulleted list — collect consecutive `- ` / `* ` lines.
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul
          key={`ul${blockKey++}`}
          style={{
            margin: "4px 0",
            paddingLeft: 20,
            listStyle: "disc"
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>
              {renderInlineMd(it)}
            </li>
          ))}
        </ul>
      );
      continue;
    }
    // Numbered list — collect `1. ` / `2. ` lines.
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={`ol${blockKey++}`}
          style={{
            margin: "4px 0",
            paddingLeft: 22,
            listStyle: "decimal"
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>
              {renderInlineMd(it)}
            </li>
          ))}
        </ol>
      );
      continue;
    }
    // Blank line → paragraph break
    if (trimmed === "") {
      blocks.push(<div key={`gap${blockKey++}`} style={{ height: 6 }} />);
      i++;
      continue;
    }
    // Regular paragraph — collect consecutive non-blank, non-list lines.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^-{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <div key={`p${blockKey++}`} style={{ marginBottom: 2 }}>
        {paraLines.map((pl, idx) => (
          <span key={idx}>
            {renderInlineMd(pl)}
            {idx < paraLines.length - 1 && <br />}
          </span>
        ))}
      </div>
    );
  }
  return blocks;
}

/**
 * Talk-to-your-twin chat (#159). The "dojo" — Jack: "you can edit both
 * sides of the conversation and basically fix either response, and
 * that's data."
 *
 * Layout: composer is FIXED to the bottom of the viewport (offset for
 * AppShell sidebar on desktop) so it's always reachable without
 * scrolling. The scroller has bottom padding equal to composer height
 * so messages aren't hidden behind it.
 *
 * Bubbles: iMessage-style. Click any bubble (user OR twin) to inline-
 * edit. Save patches /api/twin/chat/edit — assistant edits also log to
 * edit_deltas so future twin replies learn from the correction.
 */
const COMPOSER_HEIGHT = 96; // approximate height of the bottom composer
// Suggested-prompt chip strip sits on top of the composer. Its bottom
// edge anchors at calc(60px + safe-area) (the composer's top) and the
// pill itself is ~30px tall. Jack flagged: chips were visually masking
// the last chat message because the scroller height only reserved
// space for the composer, not the chips. We carve a separate budget
// so the scroller floor sits ABOVE the chip strip with a small gap.
const CHIPS_HEIGHT = 44;

export function TwinChatUI({
  selfName,
  welcome = false,
  welcomeMatch = null
}: {
  selfName: string;
  /** First arrival after building the twin — triggers a twin-led greeting. */
  welcome?: boolean;
  /** Name of the best match found for the greeting, if any. */
  welcomeMatch?: string | null;
}) {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Load history once on mount. Parse the trailing PENDING_ACTIONS
  // marker out of any assistant message so previously-staged actions
  // re-render as Approve cards.
  useEffect(() => {
    let alive = true;
    fetch("/api/twin/chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const raw = (j?.messages ?? []) as ChatRow[];
        const hydrated = raw.map((m) => {
          if (m.role !== "assistant") return m;
          const { body, actions } = splitPendingActions(m.body || "");
          return { ...m, body, pending_actions: actions };
        });
        setMessages(hydrated);
        setLoaded(true);
        if (j?._err === "schema_missing") {
          setErr(
            "Run the latest schema.sql in Supabase — twin_chat_messages table missing."
          );
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // First-arrival greeting — the twin introduces itself, orients the user,
  // and names the best match it found. Injected once when the thread loads
  // empty (welcome flow after building the twin). Ephemeral orientation
  // message; not persisted as training data. Jack: "have their twin greet
  // them — 'Hey, it's me, your twin. Here's someone I found…'"
  const greetedRef = useRef(false);
  useEffect(() => {
    if (!welcome || !loaded || greetedRef.current) return;
    greetedRef.current = true;
    if (messages.length > 0) return;
    const matchLine = welcomeMatch
      ? `And I already scanned the network — the person I'd most want you to meet is **${welcomeMatch}**. Want me to start that conversation?`
      : `Want me to find your single best match on the platform right now?`;
    const body = `Hey, it's me — your twin. 👋\n\nI'm built from everything you just gave me, and I'm already working for you. A few things we can do together:\n- Find the right people and pre-negotiate the win-win before you ever spend time on a call\n- Triage your proposals, draft messages, and update my context as you go\n- Read the network's pulse, create invites, and give feedback, all from here\n\n${matchLine}`;
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        body,
        created_at: new Date().toISOString()
      } as ChatRow
    ]);
  }, [welcome, loaded, welcomeMatch, messages.length]);

  // Auto-scroll on new message / typing indicator. On the very first
  // post-load paint we jump instantly (no smooth animation) so the
  // user lands at the bottom — Jack: "start me at the bottom of that
  // chat." After that, new messages animate in smoothly.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (!didInitialScrollRef.current && loaded) {
      // First scroll after history hydrated — go to the bottom. Deferred
      // across frames + a couple of retries because bubbles, action cards
      // and markdown finish laying out AFTER this effect fires; scrolling
      // immediately used scrollHeight before it settled, landing the user
      // mid-history. Jack: "it should load on the bottom — right now it
      // loads to the middle."
      didInitialScrollRef.current = true;
      const toBottom = () => {
        const e2 = scrollerRef.current;
        if (e2) e2.scrollTo({ top: e2.scrollHeight, behavior: "auto" });
      };
      requestAnimationFrame(() => {
        toBottom();
        requestAnimationFrame(toBottom);
      });
      setTimeout(toBottom, 150);
      setTimeout(toBottom, 420);
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending, loaded]);

  // Allow callers (suggestion chips above the composer) to bypass the
  // text-state ceremony — they pass the message string directly so the
  // user doesn't have to click chip → wait for state → click send.
  async function sendText(direct: string) {
    const t = direct.trim();
    if (!t || sending) return;
    setText("");
    setSending(true);
    setErr(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        body: t,
        created_at: new Date().toISOString()
      }
    ]);
    try {
      const res = await fetch("/api/twin/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: t })
      });
      const j = await res.json();
      if (!res.ok || j?.error) {
        setErr(j?.detail || j?.error || "Couldn't reach your twin.");
        return;
      }
      if (j.assistant) {
        // Defensively strip any embedded PENDING_ACTIONS marker from the
        // live reply (the server sometimes returns it inline). Prefer the
        // server's parsed actions; fall back to what we recover from body.
        const split = splitPendingActions(j.assistant.body || "");
        const serverActions = (j.pending_actions as PendingAction[]) || [];
        setMessages((prev) => [
          ...prev,
          {
            ...j.assistant,
            body: split.body,
            pending_actions: serverActions.length ? serverActions : split.actions
          }
        ]);
      }
    } catch (e: any) {
      setErr(e?.message || "Network error.");
    } finally {
      setSending(false);
    }
  }

  // Quick Actions (right rail) fire chat prompts into this thread via a
  // window event, so the rail becomes a launchpad for using the platform
  // through the twin rather than a duplicate of the nav menu.
  useEffect(() => {
    function onQuickPrompt(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string" && detail.trim()) {
        void sendText(detail.trim());
      }
    }
    window.addEventListener("twin-quick-prompt", onQuickPrompt as EventListener);
    return () =>
      window.removeEventListener(
        "twin-quick-prompt",
        onQuickPrompt as EventListener
      );
    // sendText is stable enough for this listener; re-binding each render is
    // cheap and avoids stale-closure on `sending`.
  });

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setErr(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        body: t,
        created_at: new Date().toISOString()
      }
    ]);
    setText("");
    try {
      const res = await fetch("/api/twin/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: t })
      });
      const j = await res.json();
      if (!res.ok || j?.error) {
        setErr(j?.detail || j?.error || "Couldn't reach your twin.");
        return;
      }
      const split = splitPendingActions(j.assistant?.body ?? "(no reply)");
      const serverActions = (j.pending_actions as PendingAction[]) || [];
      setMessages((prev) => [
        ...prev,
        {
          id: j.assistant?.id ?? `a-${Date.now()}`,
          role: "assistant",
          body: split.body || "(no reply)",
          created_at:
            j.assistant?.created_at ?? new Date().toISOString(),
          pending_actions: serverActions.length ? serverActions : split.actions
        }
      ]);
    } catch (e: any) {
      setErr(e?.message ?? "Network error.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function beginEdit(m: ChatRow) {
    setEditingId(m.id);
    setEditText(m.body);
  }

  async function saveEdit() {
    if (!editingId || savingEdit) return;
    const newBody = editText.trim();
    if (!newBody) return;
    setSavingEdit(true);
    // Optimistic local update.
    setMessages((prev) =>
      prev.map((m) => (m.id === editingId ? { ...m, body: newBody } : m))
    );
    const id = editingId;
    setEditingId(null);
    try {
      await fetch("/api/twin/chat/edit", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message_id: id, body: newBody })
      });
    } catch {
      /* swallow — local update already applied; if server rejects, it's
         only on next page load the original returns */
    } finally {
      setSavingEdit(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  /**
   * Persist that an approved action actually ran, so returning to the
   * chat doesn't re-show the Approve button for it (Jack: "make sure we
   * don't run into that problem where it forces me to click approve
   * again when I came back"). Marks the action executed in local state
   * AND rewrites the stored message body's PENDING_ACTIONS trailer (via
   * the same /api/twin/chat/edit endpoint message edits use) so the
   * executed flag survives a reload.
   */
  async function markActionExecuted(
    messageId: string,
    actionId: string,
    resultUrl?: string | null
  ) {
    let rebuiltBody: string | null = null;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.pending_actions) return m;
        const nextActions = m.pending_actions.map((a) =>
          a.id === actionId
            ? {
                ...a,
                executed: true,
                payload: resultUrl
                  ? { ...a.payload, result_url: resultUrl }
                  : a.payload
              }
            : a
        );
        // m.body is the CLEAN body (trailer already split off on load).
        // Re-append the trailer with the updated (executed) actions so
        // the persisted copy reflects the new state.
        rebuiltBody = `${m.body}\n\n<!--PENDING_ACTIONS:${JSON.stringify(
          nextActions
        )}-->`;
        return { ...m, pending_actions: nextActions };
      })
    );
    if (rebuiltBody) {
      try {
        await fetch("/api/twin/chat/edit", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message_id: messageId, body: rebuiltBody })
        });
      } catch {
        /* local state already updated; persistence is best-effort */
      }
    }
  }

  const empty = loaded && messages.length === 0;

  return (
    <div className="twin-chat-workspace">
      {/* SCROLLER — Jack: "The chat page should be separated from the
          menu page in a different scroll, and start me at the bottom
          of that chat." Was using body scroll (the whole page scrolled
          as one). Now an independent overflow-y container with its
          own height budget, so the intro header above + sidebar stay
          locked while only this panel pans.

          Height math:
            100dvh - 64px (top bar) - ~210px (page intro h1+blurb+spacing)
                   - COMPOSER_HEIGHT - safe-area-inset-bottom.
          Mobile clamp at min-300px so the chat never collapses to
          nothing on tiny viewports.

          On mount the post-load effect scrolls this element to the
          bottom (newest messages visible) since the scroll target is
          now THIS div, not the page body. */}
      <div
        ref={scrollerRef}
        className="twin-scroller"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          // Fill all the way down to the viewport bottom. The chip strip
          // and composer are position:fixed and overlay the lower region,
          // so we clear them with paddingBottom rather than shrinking the
          // scroller's height. The OLD approach subtracted COMPOSER_HEIGHT
          // + CHIPS_HEIGHT from the height — that left a dead band of page
          // background between the scroller floor and the docked chip strip
          // (the "gray box" Jack flagged) and clipped the last Approve card
          // at the scroller's short floor. Filling + padding removes the
          // gap AND guarantees the last card always clears the dock.
          padding: "4px 4px 0",
          // Clear the fixed chip strip + composer with padding tuned to the
          // ACTUAL dock height (~108px). The earlier value over-padded, so at
          // scroll-bottom there was a band of empty scroller showing below the
          // last message — the "gray bar" Jack saw on mobile.
          paddingBottom: "calc(112px + env(safe-area-inset-bottom, 0px))",
          // Independent scroll context.
          overflowY: "auto",
          overscrollBehavior: "contain",
          // Fill from the header's bottom all the way to the viewport floor
          // so the fixed chip strip + composer overlay the scroller's bottom
          // (their white surface sits directly under the content). Reserve
          // ONLY what's actually above the scroller: 64px top bar + the
          // single-line page header (~56px). The old value subtracted 120px
          // for the header — but the header was long since collapsed to one
          // line, so it over-reserved by ~64px (≈ the composer height),
          // stopping the scroller short of the floor. That left a band of
          // gray page background between the last message and the white dock
          // — the "gray bar above the chat bar" Jack flagged (a regression of
          // the original /twin gray-box fix). paddingBottom below still clears
          // the dock so the last message never hides under it.
          height: "calc(100dvh - 64px - 56px)",
          minHeight: 300,
          // Solid background so messages don't render over the page
          // bg when the scroller has its own bounds.
          background: "transparent"
        }}
      >
        {!loaded && (
          <div className="retro-dim text-sm">Loading your thread…</div>
        )}
        {empty && (
          <div
            className="twin-empty"
          >
            <span className="twin-brand-symbol" aria-hidden="true"><img src="/syncedin-wordmark-tight.png" alt="" width={438} height={106} /></span>
            <h2>What&apos;s on your mind?</h2>
            <p>Your priorities, your next introduction, or an idea worth exploring.</p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            m={m}
            selfName={selfName}
            editing={editingId === m.id}
            editText={editText}
            onBeginEdit={() => beginEdit(m)}
            onChangeEditText={setEditText}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={savingEdit}
            onActionExecuted={markActionExecuted}
          />
        ))}
        {sending && (
          // iMessage-style 3-dot typing bubble (matches the indicator
          // used in two-twin chat). Jack: "when they're typing, let's
          // show the typing animation."
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "min(86%, 580px)"
            }}
          >
            <div
              className="retro-dim text-[10px]"
              style={{
                marginBottom: 3,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "var(--blue, #2358ff)"
              }}
            >
              your twin
            </div>
            <div
              aria-label="your twin is typing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "12px 14px",
                background: "var(--panel-solid)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                color: "var(--text-dim)"
              }}
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
                    animation: `twinTypingDot 1.2s ${i * 0.18}s infinite ease-in-out`
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {err && (
          <div
            className="text-xs"
            style={{
              color: "var(--red, #d44)",
              padding: "8px 12px",
              background: "rgba(220, 68, 68, 0.08)",
              borderRadius: 8
            }}
          >
            {err}
          </div>
        )}
      </div>

      {/* SUGGESTION CHIPS — inferred next prompts. Click → fires the
          message immediately so the user doesn't have to type the
          first prompt cold. Static V1 — V2 should pull the most-recent
          counterpart name + most-recent pending proposal title from
          props to make these dynamic.

          Solid background + subtle top fade so the chips read as a
          docked surface, not as pills floating over chat content.
          Jack: "the gray bar is cutting off the chat in the background,
          removing usable space" — fixed by reserving the strip's
          height in the scroller budget AND giving it a real surface
          so the visual stop is clear. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          // Sit flush on top of the composer with no overlap gap.
          bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
          padding: "7px 14px 7px",
          background: "var(--panel-solid)",
          // Subtle hairline so the strip reads as part of the composer
          // dock, not a floating layer over the chat.
          borderTop: "1px solid var(--border)",
          pointerEvents: "none",
          zIndex: 29
        }}
        className="twin-chips"
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            gap: 5,
            overflowX: "auto",
            // Tail gradient hint so the user knows there's more →
            paddingRight: 28,
            pointerEvents: "auto",
            scrollbarWidth: "none",
            WebkitMaskImage:
              "linear-gradient(90deg, black 0, black calc(100% - 28px), transparent 100%)"
          }}
          className="twin-chips-row"
        >
          {[
            { Icon: Check, q: "Accept proposals first" },
            { Icon: Users, q: "Who to reach out today" },
            { Icon: Pencil, q: "Draft a follow-up" },
            { Icon: Target, q: "My top match this week" },
            { Icon: Inbox, q: "Prioritize my inbox" },
            { Icon: Handshake, q: "Show pending proposals" },
            { Icon: Search, q: "Search platform users" }
          ].map(({ Icon, q }) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendText(q)}
              disabled={sending}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--text-dim)",
                cursor: sending ? "default" : "pointer",
                whiteSpace: "nowrap",
                opacity: sending ? 0.5 : 1,
                height: 44
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* FIXED COMPOSER — matches the /conversations PersistentCompose
          pattern: unified 40px control heights, single visual strip,
          no outer panel border. Adds mic dictation for parity. */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--panel-solid)",
          borderTop: "1px solid var(--border)",
          padding: "10px 14px",
          paddingBottom:
            "calc(10px + env(safe-area-inset-bottom, 0px))",
          zIndex: 30
        }}
        className="twin-composer"
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            gap: 6,
            alignItems: "flex-end"
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Talk to your twin…"
            rows={1}
            className="retro-input"
            style={{
              flex: 1,
              fontSize: 14,
              padding: "10px 12px",
              resize: "none",
              minHeight: 44,
              maxHeight: 160,
              borderRadius: 6
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="retro-btn retro-btn-primary"
            aria-label={sending ? "Sending message" : "Send message"}
            title={sending ? "Sending message" : "Send message"}
            style={{
              height: 44,
              width: 44,
              padding: 0,
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 6,
              flexShrink: 0
            }}
          >
            {sending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Desktop offset: leave space for the 220px AppShell sidebar.
          ALSO bump the chip strip and the composer in 200px to align
          with the AppShell main column. Mobile keeps full width. */}
      <style>{`
        @media (min-width: 768px) {
          .twin-composer { left: 252px; }
          .twin-chips { left: 252px; }
        }
        .twin-chips-row::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function Bubble({
  m,
  selfName,
  editing,
  editText,
  onBeginEdit,
  onChangeEditText,
  onSave,
  onCancel,
  saving,
  onActionExecuted
}: {
  m: ChatRow;
  selfName: string;
  editing: boolean;
  editText: string;
  onBeginEdit: () => void;
  onChangeEditText: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  onActionExecuted?: (
    messageId: string,
    actionId: string,
    resultUrl?: string | null
  ) => void;
}) {
  const mine = m.role === "user";
  return (
    <div
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "min(86%, 580px)",
        position: "relative"
      }}
    >
      <div
        className="retro-dim text-[10px]"
        style={{
          marginBottom: 3,
          textAlign: mine ? "right" : "left",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: mine ? "var(--text-dim)" : "var(--blue, #2358ff)"
        }}
      >
        {mine ? selfName : "your twin"}
      </div>
      {editing ? (
        <div
          style={{
            background: "var(--panel-solid)",
            border: "2px solid var(--blue, #2358ff)",
            borderRadius: 16,
            padding: 8,
            minWidth: 280
          }}
        >
          <textarea
            value={editText}
            onChange={(e) => onChangeEditText(e.target.value)}
            rows={Math.max(3, Math.ceil(editText.length / 64))}
            autoFocus
            className="retro-input"
            style={{
              width: "100%",
              fontSize: 14,
              lineHeight: 1.5,
              padding: 8,
              border: "none",
              background: "transparent",
              resize: "vertical",
              minHeight: 64
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 6,
              justifyContent: "flex-end",
              marginTop: 4
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="retro-btn text-xs"
              style={{ padding: "4px 10px" }}
            >
              cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !editText.trim()}
              className="retro-btn retro-btn-primary text-xs"
              style={{ padding: "4px 12px", fontWeight: 700 }}
            >
              {saving ? "…" : mine ? "save" : "save · trains twin"}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => {
            // Don't hijack a text selection — if the user just
            // highlighted text (to copy), releasing the mouse fires this
            // click; entering edit mode would blow away their selection.
            // Jack: "if I've highlighted something and let go, it
            // shouldn't enter edit mode."
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            if (sel && sel.toString().trim().length > 0) return;
            onBeginEdit();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onBeginEdit();
            }
          }}
          title="Click to edit · refining this is training data"
          style={{
            padding: "10px 14px",
            borderRadius: 18,
            background: mine
              ? "linear-gradient(135deg, #2358ff 0%, #4a3dff 100%)"
              : "var(--panel-solid)",
            color: mine ? "#fff" : "var(--text)",
            border: mine
              ? "none"
              : "1px solid var(--border)",
            // renderMarkdown handles paragraph + list breaks itself, so
            // we don't need whiteSpace: "pre-wrap" here. Leaving it on
            // would double-render newlines as extra vertical space.
            wordBreak: "break-word",
            fontSize: 14,
            lineHeight: 1.5,
            cursor: "pointer",
            transition: "transform 80ms ease, box-shadow 80ms ease",
            position: "relative"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow =
              "0 4px 14px -4px rgba(0,0,0,0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {/* Markdown render — **bold** / *italic* / `code` / lists /
              --- separators turn into real formatting instead of raw
              asterisks. Edit mode (above) keeps raw text so the user
              can still see the markdown syntax when refining. */}
          {renderMarkdown(m.body)}
          {/* tiny edit hint, fades in on hover via CSS-in-JS sibling */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -6,
              [mine ? "left" : "right"]: -6,
              fontSize: 10,
              color: mine ? "var(--text-dim)" : "var(--text-dim)",
              opacity: 0.5,
              pointerEvents: "none",
              background: "var(--panel-solid)",
              padding: "1px 5px",
              borderRadius: 8,
              border: "1px solid var(--border)"
            } as React.CSSProperties}
          >
            ✎
          </span>
        </div>
      )}

      {/* Inline ActionCards — render when the twin staged write tools.
          Each card is an Approve button that POSTs to /api/twin/execute-
          action. The user's tap is the ONLY thing that writes to the
          DB; the twin can never mutate without explicit confirmation. */}
      {!mine &&
        m.pending_actions &&
        m.pending_actions.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}
          >
            {m.pending_actions.map((a) => (
              <ActionCard
                key={a.id}
                action={a}
                onExecuted={(resultUrl) =>
                  onActionExecuted?.(m.id, a.id, resultUrl)
                }
              />
            ))}
          </div>
        )}
    </div>
  );
}

/**
 * ActionCard — renders one twin-staged action as an inline Approve
 * card. On Approve, POSTs to /api/twin/execute-action. On success,
 * flips to a green "✓ shipped" state so the user has unambiguous
 * feedback that the DB actually changed.
 */
function ActionCard({
  action,
  onExecuted
}: {
  action: PendingAction;
  onExecuted?: (resultUrl?: string | null) => void;
}) {
  // Initialize to "done" when the action was already executed in a prior
  // session (persisted in the message trailer) so we never re-prompt
  // Approve for something that already ran.
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    action.executed ? "done" : "idle"
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [fetchedPreview, setFetchedPreview] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(
    (action.payload as any)?.result_url ?? null
  );
  const p = action.payload as any;

  const label = (() => {
    switch (action.type) {
      case "update_proposal_text":
        return p.also_accept
          ? `Update & accept proposal with ${p.counterpart_name ?? "counterpart"}`
          : `Update proposal with ${p.counterpart_name ?? "counterpart"}`;
      case "accept_proposal":
        return `Accept ${p.counterpart_name ?? "counterpart"}'s proposal`;
      case "deny_proposal":
        return `Deny ${p.counterpart_name ?? "counterpart"}'s proposal`;
      case "send_message_to_conversation":
        return `Send message to ${p.counterpart_name ?? "counterpart"}`;
      case "update_twin_context":
        return "Add to your twin's context";
      case "create_invite":
        return `Invite ${p.name ?? "someone"}`;
      case "submit_feedback":
        return "Send feedback to the team";
      case "start_conversation":
        return `Start a conversation with ${p.counterpart_name ?? "them"}`;
      default:
        return action.type;
    }
  })();

  const explicitPreview = (() => {
    if (action.type === "update_proposal_text") return p.new_text as string;
    if (action.type === "deny_proposal") return p.reason as string;
    if (action.type === "send_message_to_conversation")
      return p.text as string;
    if (action.type === "update_twin_context") return p.text as string;
    if (action.type === "submit_feedback") return p.message as string;
    if (action.type === "create_invite")
      return [p.name, p.target, p.note].filter(Boolean).join(" · ") || null;
    return null;
  })();

  // An accept card's payload carries only the conversation id + name, so
  // historically it showed a bare header + a ▶ that looked like a
  // disclosure arrow expanding to nothing. Pull the actual agreement the
  // user is about to accept and SHOW it inline. Jack: "the arrow looks
  // like it would drop down — there's lots of free place to show that."
  useEffect(() => {
    if (action.type !== "accept_proposal") return;
    const convId = p?.conversation_id;
    if (!convId) return;
    let alive = true;
    fetch(`/api/conversations/${convId}/agreement-text`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const txt = (j?.agreement_text || "")
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .trim();
        setFetchedPreview(txt || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [action.type, p?.conversation_id]);

  const previewText = explicitPreview ?? fetchedPreview;

  async function approve() {
    if (state !== "idle") return;
    setState("running");
    setErrMsg(null);
    try {
      const res = await fetch("/api/twin/execute-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: action.type, payload: action.payload })
      });
      const j = await res.json();
      if (!res.ok || j?.error) {
        setState("error");
        setErrMsg(j?.detail || j?.error || "Failed to ship.");
        return;
      }
      const url = typeof j?.url === "string" ? j.url : null;
      if (url) setResultUrl(url);
      setState("done");
      // Persist executed state so a page reload doesn't re-prompt Approve.
      onExecuted?.(url);
    } catch (e: any) {
      setState("error");
      setErrMsg(e?.message || "Network error.");
    }
  }

  const palette = (() => {
    if (action.type === "accept_proposal")
      return { primary: "#10b981", glow: "rgba(16,185,129,0.35)" };
    if (action.type === "deny_proposal")
      return { primary: "#ef4444", glow: "rgba(239,68,68,0.30)" };
    return { primary: "#2358ff", glow: "rgba(35,88,255,0.30)" };
  })();

  return (
    <div
      style={{
        border: `1px solid ${state === "done" ? "#10b981" : "var(--border)"}`,
        borderRadius: 12,
        padding: 12,
        background: "var(--panel-solid)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "min(86%, 580px)"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text)",
          textTransform: "uppercase",
          letterSpacing: "0.06em"
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: palette.primary,
            flexShrink: 0
          }}
        />
        {label}
      </div>
      {previewText && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--text)",
            padding: "8px 10px",
            background: "rgba(120,130,160,0.08)",
            borderRadius: 8,
            wordBreak: "break-word",
            maxHeight: 200,
            overflowY: "auto"
          }}
        >
          {previewText}
        </div>
      )}
      {state === "done" ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#10b981",
            display: "flex",
            alignItems: "center",
            gap: 6
          }}
        >
          {action.type === "create_invite" && resultUrl ? (
            <span style={{ wordBreak: "break-all" }}>
              ✓ Invite ready —{" "}
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#10b981", textDecoration: "underline" }}
              >
                {resultUrl}
              </a>
            </span>
          ) : action.type === "start_conversation" && resultUrl ? (
            <span>
              ✓ Conversation ready —{" "}
              <a
                href={resultUrl}
                style={{ color: "#10b981", textDecoration: "underline" }}
              >
                open it →
              </a>
            </span>
          ) : action.type === "submit_feedback" ? (
            "✓ Feedback sent — thank you."
          ) : action.type === "update_twin_context" ? (
            "✓ Added to your twin's context."
          ) : (
            "✓ Shipped to the database. You can verify on /messages."
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void approve()}
            disabled={state === "running"}
            style={{
              flex: 1,
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              background:
                state === "running"
                  ? "var(--border)"
                  : `linear-gradient(135deg, ${palette.primary} 0%, ${palette.primary} 100%)`,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: state === "running" ? "default" : "pointer",
              boxShadow:
                state === "running"
                  ? "none"
                  : `0 6px 20px -8px ${palette.glow}`
            }}
          >
            {state === "running" ? "Shipping…" : "✓ Approve"}
          </button>
          <button
            type="button"
            onClick={() => setState("done")}
            disabled={state === "running"}
            style={{
              flex: "0 0 auto",
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-dim)",
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {state === "error" && errMsg && (
        <div
          style={{
            fontSize: 12,
            color: "#ef4444",
            background: "rgba(239,68,68,0.08)",
            padding: "6px 8px",
            borderRadius: 6
          }}
        >
          {errMsg}
        </div>
      )}
    </div>
  );
}
