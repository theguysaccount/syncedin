import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  CopyButton,
  AckToggle,
  CopyAllUnackedButton
} from "./CopyButton";

/**
 * Admin error reports dashboard with one-click "ack everything new" so
 * Jack never has to re-paste a bug he's already handed off. Auto-errors
 * are grouped by signature; manual feedback gets one row each. Acked
 * groups collapse into a separate section so the active inbox stays
 * focused on what's NEW.
 *
 * Gated to jacksonjezio@gmail.com.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADMIN_EMAIL = "jacksonjezio@gmail.com";

type FeedbackRow = {
  id: string;
  user_id: string | null;
  message: string;
  surface: string | null;
  user_agent: string | null;
  created_at: string;
  image_data_url: string | null;
  acked_at: string | null;
  ack_signature: string | null;
};

type GroupedError = {
  signature: string;
  message: string;
  count: number;
  first_seen: string;
  last_seen: string;
  surfaces: Set<string>;
  user_ids: Set<string>;
  sample: FeedbackRow;
  acked: boolean;
};

function signatureOf(message: string, stored: string | null): string {
  if (stored && stored.length > 0) return stored;
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b\d{6,}\b/g, "<n>")
    .replace(/https?:\/\/\S+/gi, "<url>")
    .slice(0, 220);
}

export default async function AdminReportsPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    notFound();
  }

  const service = createServiceClient();
  // Pull the last 500 reports — auto-errors + manual feedback.
  const { data } = await service
    .from("feedback")
    .select(
      "id, user_id, message, surface, user_agent, created_at, image_data_url, acked_at, ack_signature"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data as FeedbackRow[] | null) ?? [];

  const manual: FeedbackRow[] = [];
  const grouped = new Map<string, GroupedError>();
  for (const r of rows) {
    if (r.surface && r.surface.startsWith("auto-error")) {
      const sig = signatureOf(r.message, r.ack_signature);
      const existing = grouped.get(sig);
      if (existing) {
        existing.count += 1;
        existing.last_seen =
          r.created_at > existing.last_seen ? r.created_at : existing.last_seen;
        existing.first_seen =
          r.created_at < existing.first_seen ? r.created_at : existing.first_seen;
        if (r.surface) existing.surfaces.add(r.surface);
        if (r.user_id) existing.user_ids.add(r.user_id);
        // A group is "acked" only if EVERY row in it is acked. One fresh
        // unacked re-occurrence flips the group back to active.
        if (!r.acked_at) existing.acked = false;
      } else {
        grouped.set(sig, {
          signature: sig,
          message: r.message,
          count: 1,
          first_seen: r.created_at,
          last_seen: r.created_at,
          surfaces: new Set(r.surface ? [r.surface] : []),
          user_ids: new Set(r.user_id ? [r.user_id] : []),
          sample: r,
          acked: !!r.acked_at
        });
      }
    } else {
      manual.push(r);
    }
  }

  const allUserIds = new Set<string>();
  for (const g of Array.from(grouped.values())) {
    Array.from(g.user_ids).forEach((u) => allUserIds.add(u));
  }
  for (const m of manual) {
    if (m.user_id) allUserIds.add(m.user_id);
  }
  const userIdList = Array.from(allUserIds);
  const userMap = new Map<string, { display_name: string | null; email: string | null }>();
  if (userIdList.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIdList);
    for (const p of (profiles as any[]) ?? []) {
      userMap.set(p.id, {
        display_name: p.display_name ?? null,
        email: p.email ?? null
      });
    }
  }
  function userLabel(id: string | null): string {
    if (!id) return "(signed-out)";
    const p = userMap.get(id);
    if (!p) return id.slice(0, 8);
    return p.display_name || p.email || id.slice(0, 8);
  }

  const groupedList = Array.from(grouped.values()).sort((a, b) => {
    if (a.last_seen !== b.last_seen) {
      return a.last_seen < b.last_seen ? 1 : -1;
    }
    return b.count - a.count;
  });
  const activeGroups = groupedList.filter((g) => !g.acked);
  const ackedGroups = groupedList.filter((g) => g.acked);

  function buildCopyBlob(g: GroupedError): string {
    const usersLabel = Array.from(g.user_ids)
      .map((u) => userLabel(u))
      .slice(0, 3)
      .join(", ");
    const moreUsers = g.user_ids.size - 3;
    const surfacesLabel = Array.from(g.surfaces).slice(0, 2).join(" · ");
    return [
      `# Error: ${g.message.split("\n")[0].slice(0, 240)}`,
      `count: ${g.count}`,
      `first_seen: ${g.first_seen}`,
      `last_seen: ${g.last_seen}`,
      `users: ${usersLabel}${moreUsers > 0 ? ` (+${moreUsers} more)` : ""}`,
      `surfaces: ${surfacesLabel || "(none)"}`,
      ``,
      `## Latest details`,
      g.sample.message,
      ``,
      `surface: ${g.sample.surface}`,
      `user_agent: ${g.sample.user_agent}`
    ].join("\n");
  }

  const bulkBlob = activeGroups
    .map(
      (g, i) =>
        `${i === 0 ? "" : "\n\n---\n\n"}${buildCopyBlob(g)}`
    )
    .join("");
  const bulkSignatures = activeGroups.map((g) => g.signature);

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="retro-label">internal · admin only</div>
          <h1 className="retro-h1 text-3xl mt-2">Error reports</h1>
        </div>
        <Link href="/admin/status" className="retro-btn text-sm">
          system status →
        </Link>
        <Link href="/admin/safety" className="retro-btn text-sm">Safety reports</Link>
      </div>

      <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
        Every uncaught client error + every feedback submission lands here.
        Click <strong>ack</strong> to mark something paste-shared (so the
        same bug doesn&apos;t resurface in your next handoff). Use{" "}
        <strong>Copy all new + ack</strong> to do both in one click.
      </p>

      <div
        className="mt-4 flex flex-wrap gap-3 items-center text-sm"
        style={{ color: "var(--text-dim)" }}
      >
        <span>
          <strong style={{ color: "#ef4444" }}>{activeGroups.length}</strong>{" "}
          un-acked
        </span>
        <span>
          <strong style={{ color: "#22c55e" }}>{ackedGroups.length}</strong>{" "}
          acked
        </span>
        <span>
          <strong style={{ color: "var(--text)" }}>{manual.length}</strong>{" "}
          manual feedback
        </span>
        <span style={{ marginLeft: "auto" }}>
          <CopyAllUnackedButton
            blob={bulkBlob}
            signatures={bulkSignatures}
            count={activeGroups.length}
          />
        </span>
      </div>

      <section className="mt-8">
        <h2
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#ef4444",
            marginBottom: 12
          }}
        >
          New errors ({activeGroups.length})
        </h2>
        {activeGroups.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Nothing flying. Quiet skies.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {activeGroups.map((g) => (
              <ErrorRow
                key={g.signature}
                group={g}
                userLabel={userLabel}
                copyBlob={buildCopyBlob(g)}
              />
            ))}
          </ul>
        )}
      </section>

      {ackedGroups.length > 0 && (
        <section className="mt-10">
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#22c55e",
                marginBottom: 12
              }}
            >
              ✓ Already acked ({ackedGroups.length}) — click to expand
            </summary>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "12px 0 0",
                opacity: 0.65
              }}
            >
              {ackedGroups.map((g) => (
                <ErrorRow
                  key={g.signature}
                  group={g}
                  userLabel={userLabel}
                  copyBlob={buildCopyBlob(g)}
                />
              ))}
            </ul>
          </details>
        </section>
      )}

      <section className="mt-10">
        <h2
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text)",
            marginBottom: 12
          }}
        >
          Manual feedback ({manual.length})
        </h2>
        {manual.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            No manual reports.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {manual.slice(0, 60).map((m) => (
              <li
                key={m.id}
                className="retro-panel"
                style={{ padding: 14, marginBottom: 10 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start"
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        marginBottom: 6
                      }}
                    >
                      {m.message.slice(0, 600)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-dim)"
                      }}
                    >
                      {userLabel(m.user_id)} ·{" "}
                      {new Date(m.created_at).toLocaleString()}
                      {m.surface && ` · ${m.surface}`}
                    </div>
                  </div>
                  <CopyButton
                    text={`# Feedback from ${userLabel(m.user_id)} (${
                      m.created_at
                    })\n\n${m.message}\n\nsurface: ${m.surface ?? ""}\nuser_agent: ${
                      m.user_agent ?? ""
                    }`}
                    label="copy"
                  />
                </div>
                {m.image_data_url && (
                  <img
                    src={m.image_data_url}
                    alt="screenshot"
                    style={{
                      maxWidth: 360,
                      marginTop: 10,
                      borderRadius: 8,
                      border: "1px solid var(--border)"
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ErrorRow({
  group,
  userLabel,
  copyBlob
}: {
  group: GroupedError;
  userLabel: (id: string | null) => string;
  copyBlob: string;
}) {
  const usersLabel = Array.from(group.user_ids)
    .map((u) => userLabel(u))
    .slice(0, 3)
    .join(", ");
  const moreUsers = group.user_ids.size - 3;
  const surfacesLabel = Array.from(group.surfaces).slice(0, 2).join(" · ");
  return (
    <li
      className="retro-panel"
      style={{
        padding: 14,
        marginBottom: 10,
        borderLeft: `3px solid ${group.acked ? "#22c55e" : "#ef4444"}`
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start"
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginBottom: 6
            }}
          >
            {group.message.split("\n")[0].slice(0, 240)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              lineHeight: 1.6,
              fontFamily: "monospace"
            }}
          >
            <strong style={{ color: group.acked ? "#22c55e" : "#ef4444" }}>
              ×{group.count}
            </strong>{" "}
            · last {new Date(group.last_seen).toLocaleString()}
            {" · "}
            users: {usersLabel || "(signed-out)"}
            {moreUsers > 0 ? ` (+${moreUsers})` : ""}
            {surfacesLabel && (
              <>
                {" · "}
                <span style={{ color: "var(--text-dim)" }}>
                  {surfacesLabel}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <CopyButton text={copyBlob} label="copy" />
          <AckToggle
            signatures={[group.signature]}
            initialAcked={group.acked}
          />
        </div>
      </div>
    </li>
  );
}
