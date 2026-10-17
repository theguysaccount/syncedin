"use client";

import { useEffect, useRef, useState } from "react";
import { Save, X } from "lucide-react";

export function PerConversationGoal({ conversationId, otherName, onClose }: {
  conversationId: string;
  otherName: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/goal`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error("Your conversation goal could not be loaded.");
        if (!controller.signal.aborted) {
          setValue(typeof data.goal_override === "string" ? data.goal_override : "");
          setLoaded(true);
        }
      } catch {
        if (!controller.signal.aborted) setError("Your conversation goal could not be loaded. Please retry.");
      }
    })();
    return () => controller.abort();
  }, [conversationId, reload]);

  async function save(goal: string) {
    if (!loaded || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}/goal`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal })
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error("Your goal was not saved. Please try again.");
      onClose();
    } catch {
      setError("Your goal was not saved. Your changes are still here. Please try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <form id="conversation-goal" className="mb-2 border-t pt-3" style={{ borderColor: "var(--border)" }}
    onSubmit={event => { event.preventDefault(); return save(value.trim()); }}>
    <div className="flex items-center justify-between gap-2">
      <label htmlFor="conversation-goal-input" className="text-sm font-semibold">Goal with {otherName}</label>
      <button type="button" onClick={onClose} disabled={saving} aria-label="Close goal editor" title="Close" className="retro-btn" style={{ width: 36, height: 36, padding: 0 }}><X size={16} aria-hidden="true" /></button>
    </div>
    {loaded ? <>
      <textarea id="conversation-goal-input" value={value} maxLength={500} rows={3}
        onChange={event => setValue(event.target.value)} disabled={saving}
        className="retro-input mt-2 w-full text-sm" placeholder="What would you like to accomplish with this person?" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving} className="retro-btn retro-btn-primary inline-flex items-center gap-2"><Save size={16} aria-hidden="true" />{saving ? "Saving..." : "Save goal"}</button>
        <button type="button" disabled={saving || !value} onClick={() => void save("")} className="retro-btn">Use general goal</button>
        <span className="retro-dim text-xs">{value.length}/500</span>
      </div>
    </> : error ? <button type="button" className="retro-btn mt-2" onClick={() => setReload(n => n + 1)}>Retry</button> : <p role="status" className="retro-dim text-sm">Loading goal...</p>}
    {error && <p role="alert" className="mt-2 text-sm retro-red">{error}</p>}
  </form>;
}
