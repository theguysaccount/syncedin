"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { CONNECTION_NOTE_EXAMPLES, connectionNoteBudget } from "@/lib/networking-guides";
import styles from "./guides.module.css";

export function ConnectionNoteEditor() {
  const [draft, setDraft] = useState<string>(CONNECTION_NOTE_EXAMPLES[0].text);
  const [limit, setLimit] = useState<200 | 300>(200);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const revision = useRef(0);
  const budget = connectionNoteBudget(draft, limit);
  const empty = !draft.trim();

  async function copy() {
    const currentRevision = ++revision.current;
    try {
      await navigator.clipboard.writeText(draft);
      if (currentRevision !== revision.current) return;
      setCopied(true);
      setStatus("Note copied.");
    } catch {
      if (currentRevision !== revision.current) return;
      setCopied(false);
      setStatus("Copy unavailable. Select and copy the note from the text field.");
    }
  }

  return (
    <section className={styles.editor} aria-label="Connection note draft" data-clarity-mask="True">
      <div className={styles.editorToolbar}>
        <label htmlFor="connection-note-draft">Your connection note</label>
        <div className={styles.segmented} role="group" aria-label="Character budget">
          {([200, 300] as const).map(value => <button key={value} type="button" aria-pressed={limit === value} onClick={() => { ++revision.current; setLimit(value); setCopied(false); setStatus(""); }}>{value} characters</button>)}
        </div>
      </div>
      <textarea id="connection-note-draft" value={draft} maxLength={1200} aria-describedby="connection-note-count connection-note-privacy" spellCheck onChange={event => { ++revision.current; setDraft(event.target.value); setCopied(false); setStatus(""); }} />
      <div className={styles.editorFooter}>
        <span id="connection-note-count" className={styles.counter} data-over={!budget.fits} aria-live="polite">
          {budget.count} / {limit} characters{budget.remaining < 0 ? `, ${-budget.remaining} over` : `, ${budget.remaining} left`}
        </span>
        <button type="button" className={styles.copyButton} disabled={empty || !budget.fits} onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? "Copied" : "Copy note"}
        </button>
      </div>
      <div className={styles.templates} role="group" aria-label="Example notes">
        {CONNECTION_NOTE_EXAMPLES.map(example => <button key={example.id} type="button" aria-pressed={draft === example.text} onClick={() => { ++revision.current; setDraft(example.text); setCopied(false); setStatus(""); }}>{example.label}</button>)}
      </div>
      <p className={styles.editorHint} id="connection-note-privacy">Private draft. Not sent or saved to your SyncedIn profile.</p>
      <p className={styles.editorStatus} role="status">{status}</p>
    </section>
  );
}
