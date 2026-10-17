import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Avatar } from "../../Avatar";
import { RailFilter } from "./RailFilter";

/**
 * ConversationRail — narrow vertical strip on the left of the
 * conversation page (desktop only). Lets the user hop between active
 * conversations without going back to /messages. Mounted as a fixed-
 * position element so it doesn't fight ChatUI's `h-screen` layout.
 *
 * On screens < lg it's hidden — mobile uses the back button + the
 * AppShell hamburger drawer for nav.
 *
 * Each item: small avatar + first name + status pip. The active
 * conversation is highlighted. Every link uses prefetch={true} so
 * hopping is instant.
 */
export async function ConversationRail({
  activeId
}: {
  activeId: string;
}) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();

  const { data: convs } = await supabase
    .from("conversations")
    .select(
      "id, participant_a, participant_b, status, created_at, excitement_score, last_read_a, last_read_b, summary"
    )
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (convs as any[]) ?? [];
  if (rows.length === 0) return null;

  // Status pip color per conversation. The dot used to be a flat blue
  // glyph on every avatar — Jack's call: make it mean something.
  //   amber  = waiting on YOU (last message is theirs, you should reply)
  //   gray   = waiting on them (last message is yours, ball in their court)
  //   none   = no messages yet
  // Pulled in one batched messages query so we don't N+1.
  const convIds = rows.map((c) => c.id);
  const { data: lastMsgs } = convIds.length
    ? await service
        .from("messages")
        .select("conversation_id, sender_user_id, sent_at")
        .in("conversation_id", convIds)
        .order("sent_at", { ascending: false })
    : { data: [] as Array<{
        conversation_id: string;
        sender_user_id: string;
        sent_at: string;
      }> };
  const lastByConv = new Map<string, { sender_user_id: string; sent_at: string }>();
  for (const m of (lastMsgs ?? []) as Array<{
    conversation_id: string;
    sender_user_id: string;
    sent_at: string;
  }>) {
    if (!lastByConv.has(m.conversation_id)) {
      lastByConv.set(m.conversation_id, {
        sender_user_id: m.sender_user_id,
        sent_at: m.sent_at
      });
    }
  }
  // Sort by most-recent activity (last message), falling back to created_at.
  // Jack: "the scroll-through can be most recent." Mutates the render order.
  rows.sort((a, b) => {
    const at = lastByConv.get(a.id)?.sent_at || a.created_at;
    const bt = lastByConv.get(b.id)?.sent_at || b.created_at;
    return new Date(bt).getTime() - new Date(at).getTime();
  });

  // Jack's badge language, one system everywhere:
  //   red pulsing dot  = something is REQUIRED of you (respond to a
  //                      proposal, or the last word is theirs)
  //   ✓✓ (green)       = your last message was SEEN
  //   ✓ (gray)         = your last message was delivered, not seen yet
  //   green dot        = sealed
  const { data: respRows } = convIds.length
    ? await service
        .from("agreement_responses")
        .select("conversation_id, user_id, response")
        .in("conversation_id", convIds)
    : { data: [] as any[] };
  const myRespByConv = new Map<string, string>();
  const theirRespByConv = new Map<string, string>();
  for (const r of (respRows ?? []) as Array<{
    conversation_id: string;
    user_id: string;
    response: string;
  }>) {
    if (r.user_id === user.id) myRespByConv.set(r.conversation_id, r.response);
    else theirRespByConv.set(r.conversation_id, r.response);
  }

  function railBadge(c: any):
    | { kind: "action"; label: string }
    | { kind: "seen" }
    | { kind: "delivered" }
    | { kind: "sealed" }
    | null {
    if (c.status === "closed") return { kind: "sealed" };
    // Red dot, highest priority: a proposal is waiting on YOU.
    const hasOutcome =
      typeof c.summary === "string" && c.summary.trim().length > 0;
    if (hasOutcome && !myRespByConv.has(c.id)) {
      return {
        kind: "action",
        label:
          theirRespByConv.get(c.id) === "accepted"
            ? "They accepted, one tap to seal"
            : "Proposal waiting on you"
      };
    }
    const last = lastByConv.get(c.id);
    if (!last) return null;
    // Their word is the last word: the ball is in your court.
    if (last.sender_user_id !== user!.id) {
      return { kind: "action", label: "Your turn" };
    }
    const isA = c.participant_a === user!.id;
    const theirLastRead = isA ? c.last_read_b : c.last_read_a;
    if (
      theirLastRead &&
      new Date(theirLastRead).getTime() >= new Date(last.sent_at).getTime()
    ) {
      return { kind: "seen" };
    }
    return { kind: "delivered" };
  }

  const otherIds = Array.from(
    new Set(
      rows.map((c) => (c.participant_a === user.id ? c.participant_b : c.participant_a))
    )
  );
  const { data: profiles } = await service
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .in("id", otherIds);
  const profById = new Map<
    string,
    { display_name: string | null; email: string | null; avatar_url: string | null }
  >();
  for (const p of (profiles ?? []) as any[]) {
    profById.set(p.id, {
      display_name: p.display_name ?? null,
      email: p.email ?? null,
      avatar_url: p.avatar_url ?? null
    });
  }

  const firstName = (full: string) => {
    const f = (full || "").trim();
    if (!f) return "—";
    if (f.includes("@")) return f.split("@")[0]!.split(/[._\-+]/)[0]!;
    return f.split(/\s+/)[0]!;
  };

  return (
    <>
      {/* Mobile horizontal rail — sticks under the AppShell mobile top
          bar so users can swipe between conversations without bouncing
          back to /messages. Same data as the desktop vertical rail. */}
      {/* Mobile rail — kept compact (no name labels, smaller avatars)
          so it doesn't overlap or compete with the conversation header
          right below it. Names are still implied by the avatar itself
          (initials/photo) and the active state has an amber ring. */}
      <aside
        className="flex lg:hidden"
        style={{
          position: "sticky",
          // MobileShell's top bar is 56px tall (sticky, top: 0). The rail
          // sits flush against the bottom of that bar — top: 56 prevents
          // the rail from sliding UNDER the wordmark on scroll, which was
          // creating the double-overlap you saw on mobile.
          top: 56,
          zIndex: 6,
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          background: "var(--panel-solid)",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          minHeight: 38
        }}
      >
        <Link
          href="/messages"
          prefetch={true}
          aria-label="Back to all messages"
          title="Back to all messages"
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 14,
            background: "var(--panel-2)",
            color: "var(--text-dim)",
            textDecoration: "none"
          }}
        >
          {/* Chat-bubble glyph instead of the second hamburger — the
              hamburger was confusable with MobileShell's nav drawer
              trigger right above it. This icon reads as "back to
              messages list" with one glance. */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </Link>
        {rows.map((c) => {
          const otherId =
            c.participant_a === user.id ? c.participant_b : c.participant_a;
          const p = profById.get(otherId);
          const fullName = p?.display_name || p?.email || "Someone";
          const active = c.id === activeId;
          return (
            <Link
              key={c.id}
              href={`/conversations/${c.id}`}
              prefetch={true}
              aria-label={`Open conversation with ${fullName}`}
              aria-current={active ? "page" : undefined}
              style={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                padding: 0,
                border: active
                  ? "2px solid var(--amber)"
                  : "2px solid transparent",
                borderRadius: 16,
                width: 32,
                height: 32
              }}
            >
              <div style={{ position: "relative" }}>
                <Avatar
                  id={otherId}
                  name={fullName}
                  avatarUrl={p?.avatar_url ?? null}
                  size={26}
                />
                {(() => {
                  const b = railBadge(c);
                  if (!b) return null;
                  if (b.kind === "action" || b.kind === "sealed") {
                    const red = b.kind === "action";
                    return (
                      <span
                        aria-label={red ? b.label : "sealed"}
                        title={red ? b.label : "Deal sealed"}
                        className={red ? "rail-action-dot" : undefined}
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 9,
                          height: 9,
                          borderRadius: 5,
                          background: red
                            ? "var(--red, #ef4444)"
                            : "var(--green, #3cd870)",
                          border: "1.5px solid var(--panel-solid)"
                        }}
                      />
                    );
                  }
                  const seen = b.kind === "seen";
                  return (
                    <span
                      aria-label={seen ? "seen" : "delivered"}
                      title={seen ? "Seen" : "Delivered · not seen yet"}
                      style={{
                        position: "absolute",
                        right: -4,
                        bottom: -4,
                        fontSize: 8,
                        fontWeight: 800,
                        lineHeight: 1,
                        padding: "1px 2px",
                        borderRadius: 5,
                        background: "var(--panel-solid)",
                        border: "1px solid var(--border)",
                        color: seen ? "var(--green, #22c55e)" : "#9ca3af"
                      }}
                    >
                      {seen ? "✓✓" : "✓"}
                    </span>
                  );
                })()}
              </div>
            </Link>
          );
        })}
      </aside>

      <aside
        className="hidden lg:flex"
        style={{
          position: "fixed",
          top: 16,
          bottom: 16,
          // Sits immediately right of the main sidebar. After
          // matching sidebar width to AppShell's 200px the rail
          // moves from left:252 → left:232 (200 + 16 gap + 16
          // padding) so the chat column starts at the same place
          // it does on every other AppShell page.
          left: 232,
          width: 110,
          flexDirection: "column",
          gap: 6,
          padding: 10,
          background: "var(--panel-solid)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflowY: "auto",
          zIndex: 5
        }}
      >
      <style>{`
        @keyframes rail-action-pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .rail-action-dot { animation: rail-action-pulse 1.8s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .rail-action-dot { animation: none; } }
        .conv-rail-ava { transition: transform 140ms ease, box-shadow 140ms ease; border-radius: 50%; }
        .conv-rail-link:hover .conv-rail-ava {
          transform: scale(1.06);
          box-shadow: 0 0 0 3px var(--amber-bright);
        }
      `}</style>
      <Link
        href="/messages"
        prefetch={true}
        aria-label="All messages"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          padding: "6px 4px",
          textDecoration: "none",
          color: "var(--text-dim)",
          fontSize: 9,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 700,
          borderRadius: 8,
          marginBottom: 4,
          background: "var(--panel-2)"
        }}
      >
        <span style={{ fontSize: 16 }}>☰</span>
        <span>all</span>
      </Link>

      {/* Sort control (#20) — reorders the rows below by recent / outcome. */}
      <RailFilter />

      {rows.map((c) => {
        const otherId =
          c.participant_a === user.id ? c.participant_b : c.participant_a;
        const p = profById.get(otherId);
        const fullName = p?.display_name || p?.email || "Someone";
        const fn = firstName(fullName);
        const active = c.id === activeId;
        // One badge system: red dot (required of you) > ✓✓ seen >
        // ✓ delivered > green sealed.
        const badge = railBadge(c);
        return (
          <Link
            key={c.id}
            href={`/conversations/${c.id}`}
            prefetch={true}
            aria-label={`Open conversation with ${fullName}`}
            aria-current={active ? "page" : undefined}
            className="conv-rail-link"
            data-rail-row=""
            data-ts={new Date(
              lastByConv.get(c.id)?.sent_at || c.created_at
            ).getTime()}
            data-score={
              typeof c.excitement_score === "number" ? c.excitement_score : 0
            }
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 4px",
              borderRadius: 10,
              textDecoration: "none",
              background: active ? "var(--panel-2)" : "transparent",
              border: active
                ? "1px solid var(--amber)"
                : "1px solid transparent",
              transition: "background 120ms, border-color 120ms"
            }}
          >
            <div className="conv-rail-ava" style={{ position: "relative" }}>
              <Avatar
                id={otherId}
                name={fullName}
                avatarUrl={p?.avatar_url ?? null}
                size={56}
              />
              {badge &&
                (badge.kind === "action" || badge.kind === "sealed" ? (
                  <span
                    aria-label={
                      badge.kind === "action" ? badge.label : "sealed"
                    }
                    title={
                      badge.kind === "action" ? badge.label : "Deal sealed"
                    }
                    className={
                      badge.kind === "action" ? "rail-action-dot" : undefined
                    }
                    style={{
                      position: "absolute",
                      right: -1,
                      bottom: -1,
                      width: badge.kind === "action" ? 11 : 10,
                      height: badge.kind === "action" ? 11 : 10,
                      borderRadius: 6,
                      background:
                        badge.kind === "action"
                          ? "var(--red, #ef4444)"
                          : "var(--green, #3cd870)",
                      border: "2px solid var(--panel-solid)"
                    }}
                  />
                ) : (
                  <span
                    aria-label={badge.kind === "seen" ? "seen" : "delivered"}
                    title={
                      badge.kind === "seen"
                        ? "Seen"
                        : "Delivered · not seen yet"
                    }
                    style={{
                      position: "absolute",
                      right: -3,
                      bottom: -3,
                      height: 16,
                      padding: "0 3px",
                      borderRadius: 8,
                      background: "var(--panel-solid)",
                      border: "1px solid var(--border)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color:
                        badge.kind === "seen"
                          ? "var(--green, #22c55e)"
                          : "#9ca3af",
                      lineHeight: 1
                    }}
                  >
                    <svg
                      width="16"
                      height="11"
                      viewBox="0 0 16 11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {badge.kind === "seen" ? (
                        <>
                          <path d="M1 5.5 4 8.5 9.5 2" />
                          <path d="M6.5 8.5 12 2" />
                        </>
                      ) : (
                        <path d="M3 5.5 6 8.5 11.5 2" />
                      )}
                    </svg>
                  </span>
                ))}
              {typeof c.excitement_score === "number" &&
                c.excitement_score > 0 && (
                  <span
                    title="outcome score"
                    style={{
                      position: "absolute",
                      left: -3,
                      bottom: -3,
                      minWidth: 22,
                      height: 16,
                      padding: "0 4px",
                      borderRadius: 8,
                      background: "var(--panel-solid)",
                      border: "1px solid var(--border)",
                      fontSize: 9,
                      fontWeight: 800,
                      color: "var(--amber-bright)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1
                    }}
                  >
                    {Math.round(c.excitement_score)}%
                  </span>
                )}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: active ? "var(--text)" : "var(--text-dim)",
                maxWidth: 60,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center"
              }}
            >
              {fn}
            </span>
          </Link>
        );
      })}
    </aside>
    </>
  );
}
