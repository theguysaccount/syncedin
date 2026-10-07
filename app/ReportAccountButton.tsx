"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Flag, Ban, X, CheckCircle2 } from "lucide-react";
const categories = [["spam", "Spam or scam"], ["harassment", "Harassment or abuse"], ["objectionable-content", "Objectionable content"], ["impersonation", "Impersonation"], ["other", "Other"]];
export function ReportAccountButton({ reportedUserId, reportedName, variant = "ghost" }: { reportedUserId: string; reportedName?: string; variant?: "ghost" | "chip" }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"report" | "block" | null>(null);
  const [category, setCategory] = useState("harassment");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!mode) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mode]);
  function open(next: "report" | "block") { setDone(false); setError(""); setMode(next); }
  async function submit() {
    setBusy(true); setError("");
    try {
      const res = await fetch(mode === "block" ? "/api/block-account" : "/api/report-account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "block" ? { blocked_user_id: reportedUserId } : { reported_user_id: reportedUserId, category, reason })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(res.status === 401 ? "Sign in to report or block this account." : body.error || "Please try again.");
      if (mode === "block") { setMode(null); router.replace("/messages"); router.refresh(); }
      else setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="safety-actions" data-variant={variant}>
      <button type="button" onClick={() => open("report")} title="Report account or content"><Flag size={14} aria-hidden="true" />Report</button>
      <button type="button" onClick={() => open("block")} title="Block account"><Ban size={14} aria-hidden="true" />Block</button>
    </div>
    {mounted && createPortal(<dialog ref={dialog} className="app-frame app-dialog" aria-labelledby={`safety-title-${reportedUserId}`} onCancel={e => { if (busy) e.preventDefault(); else setMode(null); }}>
      <div className="dialog-header"><h2 id={`safety-title-${reportedUserId}`}>{done ? "Report received" : `${mode === "block" ? "Block" : "Report"} ${reportedName || "this account"}`}</h2><button type="button" className="icon-button" disabled={busy} onClick={() => setMode(null)} aria-label="Close" title="Close"><X size={18} /></button></div>
      {done ? <p className="text-sm retro-dim flex gap-2"><CheckCircle2 size={18} />Our team will review the report within 24 hours.</p> : <form onSubmit={e => { e.preventDefault(); e.stopPropagation(); void submit(); }} className="grid gap-4">
        {mode === "block" ? <p className="text-sm retro-dim">Their conversations and profile will disappear from your feed. Neither of you can send the other messages. Our team will be notified.</p> : <>
          <label className="text-sm">Reason<select className="retro-input mt-2" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm">Details<textarea className="retro-input mt-2" rows={4} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe the content or behavior." /></label>
        </>}
        {error && <p className="retro-red text-sm" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="retro-btn" disabled={busy} onClick={() => setMode(null)}>Cancel</button><button className="retro-btn retro-btn-primary" disabled={busy}>{busy ? "Please wait..." : mode === "block" ? "Block account" : "Send report"}</button></div>
      </form>}
    </dialog>, document.body)}
  </>;
}
