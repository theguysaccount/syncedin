import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runAllProbes, type ProbeResult } from "@/lib/diag";

// This page hits 6+ external APIs to probe their health. There is no caching
// upside — we want a fresh signal every refresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Hard email gate. Only Jack (the founder + sole operator) sees this. We
// also notFound() for unauthenticated requests so the page surface doesn't
// even reveal it exists.
const ADMIN_EMAIL = "jacksonjezio@gmail.com";

function statusPill(p: ProbeResult): { label: string; color: string } {
  if (p.skipped) return { label: "SKIP", color: "var(--text-dim)" };
  if (p.ok) return { label: "OK", color: "#22c55e" };
  return { label: "FAIL", color: "#ef4444" };
}

export default async function AdminStatusPage() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    notFound();
  }

  const probes = await runAllProbes();

  const okCount = probes.filter((p) => p.ok).length;
  const failCount = probes.filter((p) => !p.ok && !p.skipped).length;
  const skipCount = probes.filter((p) => p.skipped).length;

  return (
    <main className="max-w-4xl mx-auto px-5 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="retro-label">internal · admin only</div>
          <h1 className="retro-h1 text-3xl mt-2">SyncedIn · System Status</h1>
        </div>
        <form>
          <button
            type="submit"
            formAction=""
            className="retro-btn"
            style={{ fontSize: 13 }}
          >
            ⟳ refresh
          </button>
        </form>
      </div>

      <div className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
        Probes every external dependency live with a real fixture call.
        OK = the call returned substance. FAIL = credentials work but the
        provider returned nothing useful, or the provider is down.
        SKIP = env var not set.
      </div>

      <div className="mt-4 flex gap-3 text-sm">
        <span style={{ color: "#22c55e" }}>OK: {okCount}</span>
        <span style={{ color: "#ef4444" }}>FAIL: {failCount}</span>
        <span style={{ color: "var(--text-dim)" }}>SKIP: {skipCount}</span>
        <span style={{ color: "var(--text-dim)" }}>
          checked at {new Date().toISOString()}
        </span>
      </div>

      <div className="mt-6 retro-panel">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={th}>Provider</th>
              <th style={th}>Category</th>
              <th style={th}>Status</th>
              <th style={th}>Latency</th>
              <th style={th}>Env var</th>
              <th style={th}>Sample / Error</th>
            </tr>
          </thead>
          <tbody>
            {probes.map((p) => {
              const pill = statusPill(p);
              return (
                <tr key={p.name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>
                    <strong>{p.name}</strong>
                  </td>
                  <td style={{ ...td, color: "var(--text-dim)" }}>
                    {p.category}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        color: pill.color,
                        fontWeight: 700,
                        fontFamily: "monospace"
                      }}
                    >
                      {pill.label}
                    </span>
                  </td>
                  <td style={{ ...td, fontFamily: "monospace" }}>
                    {p.skipped ? "—" : `${p.latencyMs}ms`}
                  </td>
                  <td
                    style={{
                      ...td,
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "var(--text-dim)"
                    }}
                  >
                    {p.envVar || "—"}
                    {p.envVar && (p.configured ? " ✓" : " ✗")}
                  </td>
                  <td
                    style={{
                      ...td,
                      fontFamily: "monospace",
                      fontSize: 12,
                      maxWidth: 480,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: p.ok
                        ? "var(--text)"
                        : p.skipped
                        ? "var(--text-dim)"
                        : "#ef4444"
                    }}
                  >
                    {p.ok ? p.sample : p.skipped ? "not configured" : p.error}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-8 text-sm" style={{ color: "var(--text-dim)" }}>
        <strong style={{ color: "var(--text)" }}>What to look for:</strong>
        <ul className="mt-2" style={{ paddingLeft: 18 }}>
          <li>
            ScrapingDog · LinkedIn failing → invites lose recipient name +
            headline, slug stays as the LinkedIn handle (e.g. /harqian
            instead of /harrison-quian).
          </li>
          <li>
            Apify failing → X / IG profile scrapes degrade to bare handles.
          </li>
          <li>
            Exa failing → general web personalization stops (founders,
            startup pages, blog posts).
          </li>
          <li>
            Recent Invites · with-scrape ratio dropping → silent quota or
            actor regression — investigate before sending more invites.
          </li>
        </ul>
      </section>
    </main>
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
