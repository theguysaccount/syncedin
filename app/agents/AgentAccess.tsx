"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, ShieldOff, ArrowRight } from "lucide-react";
type Grant = {
  id: string;
  agent_name: string;
  agent_enabled: boolean;
  grant_expires_at: string | null;
  revoked_at: string | null;
};
type Draft = {
  id: string;
  text: string;
  counterpart_id: string;
  created_at: string;
  counterpart: { display_name: string | null; handle: string | null } | null;
};
export function AgentAccess() {
  const [grants, setGrants] = useState<Grant[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/agent/access", { signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setGrants(d.grants);
        setDrafts(d.drafts);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  async function revoke(id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/agent/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setGrants((v) =>
        v.map((g) =>
          g.id === id
            ? {
                ...g,
                revoked_at: new Date().toISOString(),
                agent_enabled: false,
              }
            : g,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access could not be revoked.");
    } finally {
      setBusy("");
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Copy is unavailable. Select the draft text.");
    }
  }
  return (
    <section className="agent-access">
      <h2>My connected agents</h2>
      {!grants.length && !error && (
        <p className="retro-dim">No agents connected.</p>
      )}
      {grants.map((g) => {
        const active =
          g.agent_enabled &&
          !g.revoked_at &&
          !!g.grant_expires_at &&
          Date.parse(g.grant_expires_at) > Date.now();
        return (
          <div className="agent-access-row" key={g.id}>
            <div>
              <strong>{g.agent_name}</strong>
              <p>
                {active
                  ? `Active until ${new Date(g.grant_expires_at!).toLocaleString()}`
                  : "Access inactive"}
              </p>
            </div>
            {active && (
              <button
                type="button"
                className="retro-btn"
                onClick={() => revoke(g.id)}
                disabled={!!busy}
              >
                <ShieldOff size={17} />{" "}
                {busy === g.id ? "Revoking..." : "Revoke"}
              </button>
            )}
          </div>
        );
      })}
      {!!drafts.length && (
        <>
          <h2 className="mt-6">Introduction drafts</h2>
          {drafts.map((d) => (
            <article key={d.id} className="agent-draft">
              <strong>
                {d.counterpart?.display_name || "Connection note"}
              </strong>
              <p>{d.text}</p>
              <div className="agent-actions">
                <button
                  type="button"
                  className="retro-btn"
                  onClick={() => copy(d.text)}
                >
                  <Copy size={16} /> Copy draft
                </button>
                <Link
                  href={
                    d.counterpart?.handle
                      ? "/u/" + encodeURIComponent(d.counterpart.handle)
                      : "/dashboard"
                  }
                  className="retro-btn"
                >
                  View profile <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </>
      )}
      {error && (
        <p role="alert" className="retro-red">
          {error}
        </p>
      )}
    </section>
  );
}
