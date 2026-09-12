"use client";

import { useId, useState } from "react";
import { Brain, Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { CONNECTION_NOTE_LIMIT, type OutreachContext } from "@/lib/outreach-context";
import type { ConnectionDraft } from "@/lib/connection-drafts";

export function ConnectionNoteEditor({ context, draft, onChange }: {
  context: OutreachContext;
  draft: ConnectionDraft;
  onChange: (text: string) => void;
}) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [error, setError] = useState("");
  const [copiedText, setCopiedText] = useState("");
  const text = draft.shortText.trim();
  const key = JSON.stringify([text, context]);
  const saved = savedKey === key;
  const valid = !!text && draft.shortText.length <= CONNECTION_NOTE_LIMIT;

  async function updateTwin() {
    if (!valid || saving || draft.generating) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/outreach-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...context, original_draft: draft.originalShortText, edited_text: text })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Your twin could not save this note.");
      setSavedKey(key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your twin could not save this note.");
    } finally {
      setSaving(false);
    }
  }

  async function copyNote() {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
    } catch {
      setError("Clipboard unavailable. Select and copy the note directly.");
    }
  }

  return (
    <div className="mt-3" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="retro-label" style={{ color: "var(--amber-bright)" }}>Connection note</label>
        <span id={`${id}-count`} className="retro-dim text-xs tabular-nums shrink-0">
          {draft.shortText.length}/{CONNECTION_NOTE_LIMIT}
        </span>
      </div>
      {context.connection_reason && <p className="retro-dim text-xs mt-1 break-words">Purpose: {context.connection_reason}</p>}
      <textarea
        id={id}
        aria-describedby={`${id}-count`}
        value={draft.shortText}
        onChange={(event) => { onChange(event.target.value); setError(""); }}
        rows={4}
        className="retro-input mt-1 text-sm"
        maxLength={CONNECTION_NOTE_LIMIT}
        readOnly={draft.generating}
        placeholder="Write or paste your connection note"
      />
      <div className="mt-2 grid max-w-[340px] grid-cols-[minmax(0,1fr)_44px_44px] items-center gap-2">
        <button type="button" onClick={updateTwin} disabled={!valid || saving || saved || draft.generating}
          className="retro-btn retro-btn-primary min-w-0 inline-flex items-center gap-2 text-sm"
          style={{ height: 44, padding: "8px", fontSize: 12, gap: 6 }}
          title="Remember this note for similar recipients and connection reasons">
          {saving ? <LoaderCircle size={16} className="shrink-0 animate-spin" /> : saved ? <Check size={16} className="shrink-0" /> : <Brain size={16} className="shrink-0" />}
          <span className="truncate">{saving ? "Updating..." : saved ? "Twin updated" : "Update twin"}</span>
        </button>
        <button type="button" onClick={copyNote} disabled={!valid || draft.generating}
          className="retro-btn inline-flex shrink-0 items-center justify-center text-sm"
          style={{ width: 44, height: 44, padding: 0 }}
          aria-label={copiedText === text && text ? "Note copied" : "Copy connection note"}
          title={copiedText === text && text ? "Note copied" : "Copy connection note"}>
          {copiedText === text && text ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <a href={context.person_url} target="_blank" rel="noopener noreferrer"
          onClick={() => { if (valid) void copyNote(); }}
          className="retro-btn inline-flex shrink-0 items-center justify-center text-sm"
          style={{ width: 44, height: 44, padding: 0 }}
          aria-label="Open profile" title="Copy note and open profile">
          <ExternalLink size={16} />
        </a>
      </div>
      {(error || draft.error) && <p role="alert" className="retro-red text-xs mt-2">{error || draft.error}</p>}
      {saved && <p role="status" className="retro-dim text-xs mt-2">Saved for similar backgrounds and connection reasons.</p>}
    </div>
  );
}
