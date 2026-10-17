import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ClientDate } from "../../ClientDate";

// Live usage analytics — recomputed every load, no caching.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Hard email gate — only Jack sees this. notFound() so the route's
// existence isn't even revealed to anyone else (incl. direct-URL access).
const ADMIN_EMAIL = "jacksonjezio@gmail.com";

const DAY = 24 * 60 * 60 * 1000;

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  // Clamp to 100: counts can come from different populations (e.g. a claim
  // recorded without an incremented visit_count), and a funnel stage should
  // never display over 100%.
  return `${Math.min(100, Math.round((part / whole) * 100))}%`;
}

/** Bucket ISO timestamps into the last `days` calendar days (UTC). */
function dailyBuckets(
  timestamps: Array<string | null | undefined>,
  days: number
): { day: string; count: number }[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const ts of timestamps) {
    if (!ts) continue;
    const key = String(ts).slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));
}

function BarChart({
  data,
  color
}: {
  data: { day: string; count: number }[];
  color: string;
}) {
  const counts = data.map((d) => d.count);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const W = 880;
  const H = 150;
  const pad = 16;
  const bw = (W - pad * 2) / Math.max(1, data.length);
  const first = data[0]?.day ?? "";
  const last = data[data.length - 1]?.day ?? "";
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const h = (d.count / max) * (H - pad * 2);
          return (
            <rect
              key={d.day}
              x={pad + i * bw + 1}
              y={H - pad - h}
              width={Math.max(1, bw - 2)}
              height={Math.max(d.count > 0 ? 2 : 0, h)}
              rx={2}
              fill={color}
            />
          );
        })}
      </svg>
      <div
        className="text-xs"
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "var(--text-dim)",
          marginTop: 4
        }}
      >
        <span>{first}</span>
        <span>
          {total} total · peak {max}/day
        </span>
        <span>{last}</span>
      </div>
    </div>
  );
}

export default async function AdminUsagePage() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    notFound();
  }

  const service = createServiceClient();
  const iso7 = new Date(Date.now() - 7 * DAY).toISOString();
  const iso30 = new Date(Date.now() - 30 * DAY).toISOString();

  // ── Headline counts ───────────────────────────────────────────────────────
  const [
    totalUsersR,
    testUsersR,
    new7R,
    new30R,
    twinsBuiltR,
    active7R,
    invTotalR,
    invSentR,
    invVisitedR,
    invClaimedR,
    convTotalR,
    emailTotalR,
    email7R,
    returning7R,
    olderUsersR
  ] = await Promise.all([
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", false),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", true),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", false).gte("created_at", iso7),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", false).gte("created_at", iso30),
    service.from("twin_profiles").select("user_id, profiles!inner(is_test_persona)", { count: "exact", head: true }).eq("profiles.is_test_persona", false).not("goals", "is", null),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", false).gte("last_active_at", iso7),
    service.from("pending_invites").select("slug", { count: "exact", head: true }),
    service.from("pending_invites").select("slug", { count: "exact", head: true }).not("sent_at", "is", null),
    service.from("pending_invites").select("slug", { count: "exact", head: true }).gt("visit_count", 0),
    service.from("pending_invites").select("slug", { count: "exact", head: true }).not("claimed_by_user_id", "is", null),
    service.from("conversations").select("id", { count: "exact", head: true }),
    service.from("notification_log").select("id", { count: "exact", head: true }),
    service.from("notification_log").select("id", { count: "exact", head: true }).gte("sent_at", iso7),
    // Returning users: joined >7d ago AND active in the last 7d. A coarse
    // retention proxy — true cohort retention needs event history (PostHog).
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", false).lt("created_at", iso7).gte("last_active_at", iso7),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_persona", false).lt("created_at", iso7)
  ]);

  const totalUsers = totalUsersR.count ?? 0;
  const testUsers = testUsersR.count ?? 0;
  const new7 = new7R.count ?? 0;
  const new30 = new30R.count ?? 0;
  const twinsBuilt = twinsBuiltR.count ?? 0;
  const active7 = active7R.count ?? 0;
  const invTotal = invTotalR.count ?? 0;
  const invSent = invSentR.count ?? 0;
  const invVisited = invVisitedR.count ?? 0;
  const invClaimed = invClaimedR.count ?? 0;
  const convTotal = convTotalR.count ?? 0;
  const emailTotal = emailTotalR.count ?? 0;
  const email7 = email7R.count ?? 0;
  const returning7 = returning7R.count ?? 0;
  const olderUsers = olderUsersR.count ?? 0;

  // ── Email engagement (#22) ───────────────────────────────────────────────
  // Reads from email_events (populated by the Resend webhook). Degrades
  // gracefully to a "setup pending" state if the table doesn't exist yet
  // (i.e. the migration hasn't been run). Open rate = distinct opened /
  // distinct delivered over the last 30 days.
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let emailEng: {
    ready: boolean;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  } = { ready: false, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
  try {
    const countType = async (t: string) => {
      const { count, error } = await service
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", t)
        .gte("occurred_at", since30);
      // Missing table / column → Supabase returns an error object instead
      // of throwing. Bubble it up so the catch flips ready:false.
      if (error) throw error;
      return count ?? 0;
    };
    const [sent, delivered, opened, clicked, bounced] = await Promise.all([
      countType("email.sent"),
      countType("email.delivered"),
      countType("email.opened"),
      countType("email.clicked"),
      countType("email.bounced")
    ]);
    emailEng = { ready: true, sent, delivered, opened, clicked, bounced };
  } catch {
    /* table not migrated yet — leave ready:false */
  }

  // ── Raw data for charts + the unified user table ──────────────────────────
  const [
    { data: msgRows },
    { data: invRows },
    { data: profileRows },
    { data: signupRows },
    { data: inviteCreatedRows },
    { data: emailRows }
  ] = await Promise.all([
    service.from("messages").select("sender_user_id, sent_at").limit(20000),
    service.from("pending_invites").select("inviter_user_id").limit(20000),
    service
      .from("profiles")
      .select("id, display_name, email, handle, last_active_at, created_at")
      .eq("is_test_persona", false)
      .limit(1000),
    service.from("profiles").select("created_at").eq("is_test_persona", false).gte("created_at", iso30),
    service.from("pending_invites").select("created_at").gte("created_at", iso30),
    service.from("notification_log").select("kind").order("sent_at", { ascending: false }).limit(1000)
  ]);

  const msgBy = new Map<string, number>();
  const msgTimestamps: string[] = [];
  for (const r of (msgRows ?? []) as Array<{ sender_user_id: string; sent_at: string }>) {
    if (r.sender_user_id) msgBy.set(r.sender_user_id, (msgBy.get(r.sender_user_id) ?? 0) + 1);
    if (r.sent_at) msgTimestamps.push(r.sent_at);
  }
  const invBy = new Map<string, number>();
  for (const r of (invRows ?? []) as Array<{ inviter_user_id: string }>) {
    if (r.inviter_user_id) invBy.set(r.inviter_user_id, (invBy.get(r.inviter_user_id) ?? 0) + 1);
  }

  // ── Unified user table — power users + recency in ONE place ───────────────
  // (Jack: "rather than power users and recently active in separate things,
  // have it all in one.") One row per user: activity + last seen + joined.
  const rows = ((profileRows ?? []) as any[])
    .map((p) => {
      const messages = msgBy.get(p.id) ?? 0;
      const invites = invBy.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.display_name || p.email || p.id.slice(0, 8),
        handle: p.handle as string | null,
        messages,
        invites,
        total: messages + invites,
        last_active_at: p.last_active_at as string | null,
        created_at: p.created_at as string | null
      };
    })
    // Sort by activity, then by recency, so power users surface first but a
    // recently-active newcomer still appears.
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const at = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
      const bt = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, 40);

  const signupSeries = dailyBuckets(
    ((signupRows ?? []) as Array<{ created_at: string }>).map((r) => r.created_at),
    30
  );
  const activitySeries = dailyBuckets(msgTimestamps, 30);
  const invitesSeries = dailyBuckets(
    ((inviteCreatedRows ?? []) as Array<{ created_at: string }>).map((r) => r.created_at),
    30
  );

  const emailByKind = new Map<string, number>();
  for (const r of (emailRows ?? []) as Array<{ kind: string }>) {
    emailByKind.set(r.kind, (emailByKind.get(r.kind) ?? 0) + 1);
  }
  const emailKinds = Array.from(emailByKind.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="retro-label">internal · admin only</div>
      <h1 className="retro-h1 text-3xl mt-2">SyncedIn · Usage</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
        Live from Supabase, recomputed every load. Test personas excluded.
        checked {new Date().toISOString()}
      </p>

      <div
        className="mt-6"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}
      >
        <Stat label="Real users" value={totalUsers} sub={`${testUsers} test personas`} />
        <Stat label="Twins built" value={twinsBuilt} sub={`${pct(twinsBuilt, totalUsers)} of users`} />
        <Stat label="Active (7d)" value={active7} sub={`${pct(active7, totalUsers)} of users`} />
        <Stat label="New (7d / 30d)" value={`${new7} / ${new30}`} />
        <Stat label="Conversations" value={convTotal} />
        <Stat label="Emails (7d / all)" value={`${email7} / ${emailTotal}`} />
        <Stat
          label="Returning (7d)"
          value={`${returning7} / ${olderUsers}`}
          sub={`${pct(returning7, olderUsers)} of pre-week users came back`}
        />
      </div>

      {/* ── Time-series charts ── */}
      <h2 className="retro-h1 text-xl mt-8">New signups · last 30 days</h2>
      <div className="mt-3 retro-panel" style={{ padding: 16 }}>
        <BarChart data={signupSeries} color="var(--amber)" />
      </div>

      <h2 className="retro-h1 text-xl mt-8">Platform activity (messages) · last 30 days</h2>
      <div className="mt-3 retro-panel" style={{ padding: 16 }}>
        <BarChart data={activitySeries} color="var(--amber-bright)" />
      </div>

      <h2 className="retro-h1 text-xl mt-8">Invites created · last 30 days</h2>
      <div className="mt-3 retro-panel" style={{ padding: 16 }}>
        <BarChart data={invitesSeries} color="#9333ea" />
      </div>

      {/* ── Referral funnel ── */}
      <h2 className="retro-h1 text-xl mt-8">Referral funnel</h2>
      <div className="mt-3 retro-panel" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          <Stat label="Invites drafted" value={invTotal} />
          <Stat label="Visited link" value={invVisited} sub={`${pct(invVisited, invTotal)} of drafted`} />
          <Stat label="Claimed (signed up)" value={invClaimed} sub={`${pct(invClaimed, invVisited)} of visits`} />
          <Stat label="Marked sent (manual)" value={invSent} sub="manual flag, usually skipped" />
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>
          The real funnel is drafted → visited → claimed; visited/drafted is the
          closest thing we have to an open-rate (did the recipient open their
          link). &quot;Marked sent&quot; is a manual button most people skip, so
          it&apos;s shown separately rather than as a funnel stage. True email
          open/read tracking now lives in the Email engagement panel below.
        </p>
      </div>

      {/* ── Email engagement (real opens/clicks via Resend webhook) ── */}
      <h2 className="retro-h1 text-xl mt-8">Email engagement · last 30 days</h2>
      <div className="mt-3 retro-panel" style={{ padding: 16 }}>
        {emailEng.ready ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
              <Stat label="Sent" value={emailEng.sent} />
              <Stat label="Delivered" value={emailEng.delivered} sub={`${pct(emailEng.delivered, emailEng.sent)} of sent`} />
              <Stat label="Opened" value={emailEng.opened} sub={`${pct(emailEng.opened, emailEng.delivered)} open rate`} />
              <Stat label="Clicked" value={emailEng.clicked} sub={`${pct(emailEng.clicked, emailEng.opened)} of opens`} />
              <Stat label="Bounced" value={emailEng.bounced} sub={`${pct(emailEng.bounced, emailEng.sent)} of sent`} />
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>
              Counts are distinct events per message (re-fired webhooks are
              deduped). Open rate is the industry-standard delivered→opened
              ratio. Open tracking only fires for HTML emails with images
              enabled in the recipient&apos;s client, so treat it as a floor.
            </p>
          </>
        ) : (
          <div className="text-sm" style={{ color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--amber-bright)" }}>Setup pending.</strong>{" "}
            The email_events table isn&apos;t live yet. To turn this on: (1) run{" "}
            <code>supabase/migrations/0001_email_events.sql</code> in the Supabase
            SQL editor, (2) add the Resend webhook at{" "}
            <code>/api/webhooks/resend</code> for the email.* events, (3) set{" "}
            <code>RESEND_WEBHOOK_SECRET</code> in Vercel, (4) enable Open + Click
            tracking on the syncedin.org domain in Resend. Data appears here on
            the next send after that.
          </div>
        )}
      </div>

      {/* ── Unified users table ── */}
      <h2 className="retro-h1 text-xl mt-8">Users · activity & recency</h2>
      <div className="mt-3 retro-panel" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={th}>User</th>
              <th style={th}>Msgs</th>
              <th style={th}>Invites</th>
              <th style={th}>Activity</th>
              <th style={th}>Last active</th>
              <th style={th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>No users yet.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>
                  <strong>{r.name}</strong>
                  {r.handle && <span style={{ color: "var(--text-dim)" }}> · /{r.handle}</span>}
                </td>
                <td style={{ ...td, fontFamily: "monospace" }}>{r.messages}</td>
                <td style={{ ...td, fontFamily: "monospace" }}>{r.invites}</td>
                <td style={{ ...td, fontFamily: "monospace", fontWeight: 700 }}>{r.total}</td>
                <td style={{ ...td, color: "var(--text-dim)" }}>
                  {r.last_active_at ? <ClientDate value={r.last_active_at} /> : "—"}
                </td>
                <td style={{ ...td, color: "var(--text-dim)" }}>
                  {r.created_at ? <ClientDate value={r.created_at} /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Email breakdown ── */}
      <h2 className="retro-h1 text-xl mt-8">Emails by type</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        From notification_log (last 1000). Spot which notifications fire most
        before deciding what to cut.
      </p>
      <div className="mt-3 retro-panel" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={th}>Kind</th>
              <th style={th}>Count</th>
            </tr>
          </thead>
          <tbody>
            {emailKinds.length === 0 && (
              <tr>
                <td style={td} colSpan={2}>No emails logged yet.</td>
              </tr>
            )}
            {emailKinds.map(([kind, count]) => (
              <tr key={kind} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>{kind}</td>
                <td style={{ ...td, fontFamily: "monospace" }}>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="retro-panel" style={{ padding: 14 }}>
      <div className="retro-label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-dim)",
  borderBottom: "1px solid var(--border)"
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  verticalAlign: "top"
};
