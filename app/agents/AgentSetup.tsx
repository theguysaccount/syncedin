"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Asterisk,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileJson,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Terminal,
  UsersRound,
} from "lucide-react";
import { AGENT_PROMPT } from "@/lib/agent-request";
import { BrandMark } from "../BrandMark";
const PROVIDERS = [
  { name: "ChatGPT", Icon: Sparkles },
  { name: "Claude", Icon: Asterisk },
  { name: "Codex / other", Icon: Terminal },
];
export function AgentSetup() {
  const [provider, setProvider] = useState("ChatGPT");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState("");
  const [profileJson, setProfileJson] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const ProviderIcon = PROVIDERS.find((p) => p.name === provider)!.Icon;
  async function copy() {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
    } catch {
      setError("Copy is unavailable. Select the request below.");
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText("https://syncedin.org/join.md");
      setLinkCopied(true);
    } catch {
      setError("Copy is unavailable. Select the agent URL below.");
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
      <ol className="agent-journey" aria-label="Profile setup">
        <li aria-current="step">
          <span>{copied ? <Check size={18} /> : <Bot size={18} />}</span>
          <strong>Your agent</strong>
        </li>
        <li>
          <span>
            <ShieldCheck size={18} />
          </span>
          <strong>Your approval</strong>
        </li>
        <li>
          <span>
            <UsersRound size={18} />
          </span>
          <strong>Your people</strong>
        </li>
      </ol>
      <div
        className="agent-provider-modes"
        role="group"
        aria-label="Choose your agent"
      >
        {PROVIDERS.map(({ name, Icon }) => (
          <button
            type="button"
            key={name}
            aria-pressed={provider === name}
            onClick={() => {
              setProvider(name);
              setCopied(false);
            }}
          >
            <Icon size={21} aria-hidden="true" />
            <span>{name}</span>
            <Check
              size={16}
              className="agent-provider-check"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <div className="agent-request-tool" data-copied={copied}>
        <div className="agent-request-identity">
          <span className="agent-source-icon">
            <ProviderIcon size={28} aria-hidden="true" />
          </span>
          <strong>{provider}</strong>
          <span className="agent-connection-bridge" aria-hidden="true">
            <ArrowRight size={20} />
          </span>
          <BrandMark />
          <span className="agent-twin-label">Your twin</span>
        </div>
        <div className="agent-request-content">
          <div className="agent-request-heading">
            <label htmlFor="agent-request">Your request</label>
            <span>
              <ShieldCheck size={15} aria-hidden="true" /> Private draft
            </span>
          </div>
          <textarea
            id="agent-request"
            readOnly
            value={AGENT_PROMPT}
            rows={5}
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
          <p className="agent-copy-status" role="status" aria-live="polite">
            {copied ? (
              <>
                <Check size={15} aria-hidden="true" /> Request copied for{" "}
                {provider}
              </>
            ) : null}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="retro-red">
          {error}
        </p>
      )}
      <div className="agent-endpoint">
        <Bot size={19} />
        <code>https://syncedin.org/join.md</code>
        <button
          type="button"
          className="agent-link-copy"
          onClick={copyLink}
          aria-label="Copy agent URL"
          title="Copy agent URL"
        >
          {linkCopied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <a href="/join.md#mcp" title="MCP connection details">
          MCP <ArrowRight size={14} aria-hidden="true" />
        </a>
        <span role="status" className="sr-only">
          {linkCopied ? "Agent URL copied" : ""}
        </span>
      </div>
      <details className="agent-import">
        <summary>
          <FileJson size={19} aria-hidden="true" /> Import agent profile{" "}
          <ChevronDown
            size={17}
            className="agent-import-chevron"
            aria-hidden="true"
          />
        </summary>
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
