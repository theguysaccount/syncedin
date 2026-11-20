"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { CONVERSATION_BRIEF_EXAMPLES, CONVERSATION_BRIEF_LIMIT, conversationBriefBudget, type ConversationBrief } from "@/lib/networking-goals";
import styles from "./guides.module.css";

const fields: ReadonlyArray<{ key: keyof ConversationBrief; label: string; placeholder: string }> = [
  { key: "purpose", label: "What do you want to explore?", placeholder: "Compare how we evaluate reasoning-model calibration." },
  { key: "contribution", label: "What can you contribute?", placeholder: "One method, resource, or relevant experience." },
  { key: "nextStep", label: "What is one possible next step?", placeholder: "An exchange the other person can freely accept or decline." },
  { key: "boundary", label: "What is out of scope?", placeholder: "Commitments, topics, or assumptions to avoid." },
];

export function ConversationGoalBuilder() {
  const [brief, setBrief] = useState<ConversationBrief>({ purpose: "", contribution: "", nextStep: "", boundary: "" });
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const revision = useRef(0);
  const budget = conversationBriefBudget(brief);

  function change(next: ConversationBrief) {
    ++revision.current;
    setBrief(next);
    setCopied(false);
    setStatus("");
  }

  async function copy() {
    const currentRevision = ++revision.current;
    try {
      await navigator.clipboard.writeText(budget.text);
      if (currentRevision !== revision.current) return;
      setCopied(true);
      setStatus("Conversation brief copied.");
    } catch {
      if (currentRevision !== revision.current) return;
      setCopied(false);
      setStatus("Copy unavailable. Select and copy the brief below.");
    }
  }

  return <section className={styles.editor} aria-label="Conversation goal brief" data-clarity-mask="True">
    <div className={styles.briefHeading}><h2>Your conversation brief</h2><span>Private draft</span></div>
    <div className={styles.briefFields}>
      {fields.map(field => <div key={field.key}>
        <label htmlFor={`brief-${field.key}`}>{field.label}</label>
        <textarea id={`brief-${field.key}`} rows={2} maxLength={500} placeholder={field.placeholder} value={brief[field.key]} onChange={event => change({ ...brief, [field.key]: event.target.value })} aria-describedby="conversation-brief-count conversation-brief-privacy" />
      </div>)}
    </div>
    <div className={styles.templates} role="group" aria-label="Example conversation briefs">
      {CONVERSATION_BRIEF_EXAMPLES.map(example => <button key={example.id} type="button" aria-pressed={budget.text === conversationBriefBudget(example.brief).text} onClick={() => change({ ...example.brief })}>{example.label}</button>)}
    </div>
    <div className={styles.briefOutput}>
      <label htmlFor="conversation-brief-output">Your brief</label>
      <textarea id="conversation-brief-output" rows={6} readOnly value={budget.text} aria-describedby="conversation-brief-count" />
    </div>
    <div className={styles.editorFooter}>
      <span id="conversation-brief-count" className={styles.counter} data-over={!budget.fits} aria-live="polite">{budget.count} / {CONVERSATION_BRIEF_LIMIT} characters{budget.remaining < 0 ? `, ${-budget.remaining} over` : `, ${budget.remaining} left`}</span>
      <button type="button" className={styles.copyButton} disabled={!budget.ready || !budget.fits} onClick={copy}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? "Copied" : "Copy brief"}</button>
    </div>
    <p className={styles.editorHint} id="conversation-brief-privacy">Not sent, saved, or added to your SyncedIn profile.</p>
    <p className={styles.editorStatus} role="status">{status}</p>
  </section>;
}
