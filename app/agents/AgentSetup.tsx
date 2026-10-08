"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Terminal,
} from "lucide-react";
import { AGENT_PROMPT } from "@/lib/agent-request";
export function AgentSetup() {
  const [provider, setProvider] = useState("ChatGPT");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [profileJson, setProfileJson] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
    } catch {
      setError("Copy is unavailable. Select the request below.");
    }
  }
  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      let input;
      try {
        input = JSON.parse(profileJson);
      } catch {
        throw new Error("Paste the profile JSON returned by your agent.");
      }
      const response = await fetch("/api/agent/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const link = new URL(data.verificationUrl);
      window.location.assign(link.pathname + link.search + link.hash);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your draft could not be prepared.",
      );
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="agent-setup">
      <div
        className="agent-provider-modes"
        role="group"
        aria-label="Choose your agent"
      >
        {["ChatGPT", "Claude", "Codex / other"].map((p) => (
          <button
            type="button"
            key={p}
            aria-pressed={provider === p}
            onClick={() => {
              setProvider(p);
              setCopied(false);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <label htmlFor="agent-request">Your request</label>
      <textarea
        id="agent-request"
        readOnly
        value={AGENT_PROMPT}
        rows={6}
        className="retro-input"
        data-clarity-mask="True"
      />
      <div className="agent-actions">
        <button
          type="button"
          className="retro-btn retro-btn-primary"
          onClick={copy}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
          {copied ? "Copied" : "Copy request"}
        </button>
        {provider !== "Codex / other" ? (
          <a
            className="retro-btn"
            href={
              provider === "ChatGPT"
                ? "https://chatgpt.com/"
                : "https://claude.ai/new"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={18} /> Open {provider}
          </a>
        ) : (
          <a className="retro-btn" href="/join.md">
            <Terminal size={18} /> Agent protocol
          </a>
        )}
      </div>
      {error && (
        <p role="alert" className="retro-red">
          {error}
        </p>
      )}
      <div className="agent-endpoint">
        <Bot size={19} />
        <code>https://syncedin.org/join.md</code>
        <a href="/join.md#mcp" title="MCP connection details">
          MCP
        </a>
      </div>
      <details className="agent-import">
        <summary>Import agent profile</summary>
        <form onSubmit={prepare}>
          <label htmlFor="agent-profile-json">Profile JSON</label>
          <textarea
            id="agent-profile-json"
            className="retro-input"
            rows={7}
            required
            maxLength={18000}
            spellCheck={false}
            value={profileJson}
            onChange={(e) => setProfileJson(e.target.value)}
            data-clarity-mask="True"
          />
          <button type="submit" className="retro-btn" disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <ArrowRight size={18} />
            )}{" "}
            {busy ? "Preparing..." : "Review profile"}
          </button>
        </form>
      </details>
    </section>
  );
}
