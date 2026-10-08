"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { type AgentProfile } from "@/lib/agent-profile";
type Preview = {
  agent_name: string;
  profile: AgentProfile;
  context: {
    sourceLabels?: string[];
    inferredFields?: string[];
    note?: string;
  };
  expires_at: string;
};
const fields: [keyof AgentProfile, string, number][] = [
  ["display_name", "Name", 80],
  ["goals", "What I want to accomplish", 2000],
  ["deal_preferences", "What I offer and who I want to meet", 2000],
  ["communication_style", "My voice", 800],
  ["deal_breakers", "My boundaries", 1000],
  ["current_city", "City", 120],
  ["achievements", "Background and achievements", 1600],
  ["ai_export_blob", "Professional context for my twin", 6000],
];
export function AgentReview({
  id,
  signedIn,
  initialPhone,
}: {
  id: string;
  signedIn: boolean;
  initialPhone: string;
}) {
  const [draft, setDraft] = useState<Preview | null>(null),
    [ticket, setTicket] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [access, setAccess] = useState(false),
    [phone, setPhone] = useState(initialPhone);
  const [native, setNative] = useState(false);
  const pending = useRef(false);
  useEffect(() => setNative(Capacitor.isNativePlatform()), []);
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
          "ticket",
        );
        const key = "syncedin-review-" + id;
        let t = fragment && /^sir_[a-f0-9]{64}$/.test(fragment) ? fragment : "";
        try {
          if (t)
            localStorage.setItem(
              key,
              JSON.stringify({ ticket: t, expires: Date.now() + 86400000 }),
            );
          else {
            const saved = JSON.parse(localStorage.getItem(key) || "null");
            if (
              saved &&
              saved.expires > Date.now() &&
              /^sir_[a-f0-9]{64}$/.test(saved.ticket)
            )
              t = saved.ticket;
            else localStorage.removeItem(key);
          }
        } catch {}
        if (fragment)
          history.replaceState(null, "", location.pathname + location.search);
        setTicket(t);
        if (!t)
          throw new Error(
            "Open the original private review link from your agent.",
          );
        const r = await fetch("/api/agent/preview", {
          method: "POST",
          signal: c.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ticket: t }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) setDraft(d);
      } catch (e) {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Draft could not be loaded.",
          );
      }
    }
    void load();
    return () => c.abort();
  }, [id]);
  async function approve(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || pending.current || !signedIn) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ticket,
          profile: draft.profile,
          phone_number: phone,
          native_app: native,
          confirmed_profile: confirmed,
          grant_agent_access: access,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      try {
        localStorage.removeItem("syncedin-review-" + id);
      } catch {}
      window.location.assign(d.next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your profile could not be saved.",
      );
      setBusy(false);
      pending.current = false;
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Make sure it feels like you.</h1>
          <p>
            {draft
              ? `Private draft prepared by ${draft.agent_name}.`
              : "Your private profile draft."}
          </p>
        </div>
      </header>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {!draft && !error && (
        <p role="status">
          <LoaderCircle size={18} className="animate-spin inline" /> Loading
          your draft...
        </p>
      )}
      {draft && (
        <form onSubmit={approve} className="agent-review-form">
          {draft.context.note && (
            <p className="agent-review-note">{draft.context.note}</p>
          )}
          {!!draft.context.inferredFields?.length && (
            <p className="agent-review-note">
              Check inferred details: {draft.context.inferredFields.join(", ")}
            </p>
          )}
          {fields.map(([key, label, max]) => (
            <div key={key}>
              <label htmlFor={"review-" + key}>{label}</label>
              {key === "display_name" || key === "current_city" ? (
                <input
                  className="retro-input"
                  id={"review-" + key}
                  required={key === "display_name"}
                  readOnly={!signedIn}
                  maxLength={max}
                  value={draft.profile[key] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      profile: { ...draft.profile, [key]: e.target.value },
                    })
                  }
                />
              ) : (
                <textarea
                  className="retro-input"
                  id={"review-" + key}
                  rows={key === "ai_export_blob" ? 5 : 3}
                  required={key === "goals"}
                  readOnly={!signedIn}
                  minLength={key === "goals" ? 10 : undefined}
                  maxLength={max}
                  value={draft.profile[key] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      profile: { ...draft.profile, [key]: e.target.value },
                    })
                  }
                />
              )}
            </div>
          ))}
          {signedIn ? (
            <>
              <div>
                <label htmlFor="review-phone">
                  Private phone number{native ? " (optional)" : ""}
                </label>
                <input
                  id="review-phone"
                  type="tel"
                  autoComplete="tel"
                  required={!native}
                  className="retro-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="retro-dim text-xs mt-2">
                  Not shared with your agent or other members. Messaging
                  preferences stay unchanged.
                </p>
              </div>
              <label className="terms-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  required
                />
                <span>
                  I approve these details for my SyncedIn profile and twin. My
                  name and professional goals may appear to other members.
                </span>
              </label>
              <label className="terms-check">
                <input
                  type="checkbox"
                  checked={access}
                  onChange={(e) => setAccess(e.target.checked)}
                />
                <span>
                  Give {draft.agent_name} 24-hour access to read my approved
                  profile, find matches, and prepare private introductions. It
                  cannot send messages or approve commitments.
                </span>
              </label>
              <button
                className="retro-btn retro-btn-primary"
                disabled={busy || !confirmed}
              >
                {busy ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <ShieldCheck size={18} />
                )}{" "}
                {busy ? "Saving..." : "Approve and build my twin"}
              </button>
            </>
          ) : (
            <Link
              href={
                "/login?next=" + encodeURIComponent("/agent/review?id=" + id)
              }
              className="retro-btn retro-btn-primary"
            >
              Sign in to review and approve <ArrowRight size={18} />
            </Link>
          )}
          <p className="retro-dim text-xs">
            Draft expires {new Date(draft.expires_at).toLocaleString()}.
          </p>
        </form>
      )}
    </>
  );
}
