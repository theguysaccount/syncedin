"use client";

import Link from "next/link";
import { ReportAccountButton } from "../ReportAccountButton";
import { useEffect, useRef, useState } from "react";
import { startConversationWithUser } from "./actions";
import { DotsLoader } from "../DotsLoader";
import { Globe, MapPin, Pencil, RotateCw, Trash2 } from "lucide-react";
import { ConnectionNoteEditor } from "./ConnectionNoteEditor";
import { capConnectionNote, CONNECTION_REASON_LIMIT, parseOutreachContext, type OutreachContext } from "@/lib/outreach-context";
import { discoveryCacheKey, discoveryQuery, matchesCity, type SearchScope } from "@/lib/discovery-search";
import { connectionDraftKey, connectionDraftStorageKey, restoreConnectionDrafts, serializeConnectionDrafts, type ConnectionDraft } from "@/lib/connection-drafts";

/**
 * Deterministic "cool default avatar" generator for directory rows
 * where the user hasn't uploaded a photo. Hashes the user id into a
 * 2-stop gradient pulled from the same palette family the SyncMeter
 * uses, then overlays the user's initials. Same user always gets the
 * same avatar — feels intentional, not random.
 */
const AVATAR_PALETTES: [string, string][] = [
  ["#1f8bff", "#6b2dc9"], // signature blue → purple
  ["#ff7849", "#d83bff"], // coral → magenta
  ["#22c55e", "#0ea5e9"], // green → sky
  ["#f59e0b", "#ef4444"], // amber → red
  ["#a855f7", "#ec4899"], // violet → pink
  ["#0ea5e9", "#22d3ee"], // sky → cyan
  ["#7c3aed", "#2563eb"], // indigo
  ["#10b981", "#84cc16"]  // emerald → lime
];

function paletteFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

function initialsOf(name: string | null, email: string): string {
  const src = (name || email || "").trim();
  if (!src) return "??";
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function DirectoryAvatar({
  id,
  displayName,
  email,
  avatarUrl,
  size = 40
}: {
  id: string;
  displayName: string | null;
  email: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          objectFit: "cover",
          flexShrink: 0
        }}
      />
    );
  }
  const [a, b] = paletteFor(id);
  const initials = initialsOf(displayName, email);
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        color: "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: size * 0.4,
        letterSpacing: "0.02em",
        flexShrink: 0,
        boxShadow: `0 4px 14px -4px ${a}55`
      }}
    >
      {initials}
    </div>
  );
}

const DISMISSED_KEY = "syncedin.directoryDismissed";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(s: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore quota */
  }
}

type DirectoryUser = {
  id: string;
  display_name: string | null;
  email: string;
  goals: string | null;
  /** First substantive line from ai_export_blob when goals is stale. */
  headline_fallback?: string;
  /** 0-100 token-overlap score with the current user's twin. */
  connection_score?: number;
  avatar_url?: string | null;
  /** Signup timestamp in ms. Used to render a "NEW" pill on rows
   *  created within the last 14 days. */
  created_at_ms?: number;
  location?: string | null;
};
type ExaPerson = { title: string; url: string; highlights: string[] };
type FindResponse = {
  sync_users: { id: string; display_name: string | null; email: string | null }[];
  exa_people: ExaPerson[];
};

const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);

/**
 * Heuristic for detecting placeholder / in-progress / clearly-not-a-bio
 * goals strings so we don't ship cringey card text like "Trying to get
 * through the sign up page" once a user has actually finished setup.
 *
 * Returns true if the string is OK to display.
 */
function looksLikeRealBio(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 15) return false;
  // Common placeholder/draft markers — case-insensitive.
  if (
    /^(trying|testing|test\b|asdf|qwert|placeholder|tbd|wip|in progress|getting through|getting started|just signed up|signing up|setting up|setup|onboarding|loading|todo|coming soon|fill .* later|update .* later)/i.test(
      t
    )
  )
    return false;
  // Obvious self-references to the platform's own UI.
  if (/sign\s*up\s*page|sign\s*in\s*page|onboarding\s*page|magic\s*link/i.test(t))
    return false;
  // Pure punctuation / repetition / single-word filler.
  if (!/[A-Za-z]/.test(t)) return false;
  if (/^(.)\1+$/.test(t)) return false;
  return true;
}

/**
 * Top-of-dashboard Discover.
 * - Empty input → renders the existing-user directory (finished twins).
 * - Typed input → searches SyncedIn AND the open web (Exa) via
 *   /api/find-counterpart. Existing users get "Open" → start conversation.
 *   Web matches get "Draft invite" → your twin writes the outreach.
 */
export function DiscoverSearch({
  directory, userId, defaultLocation = ""
}: {
  directory: DirectoryUser[];
  userId: string;
  defaultLocation?: string;
}) {
  const [q, setQ] = useState("");
  const [connectionReason, setConnectionReason] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("global");
  const [searchLocation, setSearchLocation] = useState(defaultLocation);
  const [settingsReady, setSettingsReady] = useState(false);
  const [searchError, setSearchError] = useState("");
  const settingsKey = `syncedin.discoverySettings.v1:${userId}`;
  const draftsKey = connectionDraftStorageKey(userId);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(settingsKey) || "null");
      if (saved?.scope === "local" || saved?.scope === "global") setSearchScope(saved.scope);
      if (typeof saved?.location === "string") setSearchLocation(saved.location.slice(0, 120));
      if (typeof saved?.query === "string") setQ(saved.query.slice(0, 500));
      if (typeof saved?.reason === "string") setConnectionReason(saved.reason.slice(0, CONNECTION_REASON_LIMIT));
    } catch { /* Keep defaults when storage is unavailable. */ }
    try { setDrafts(restoreConnectionDrafts(localStorage.getItem(draftsKey))); } catch { /* Browser storage may be disabled. */ }
    setSettingsReady(true);
  }, [settingsKey, draftsKey]);
  useEffect(() => {
    if (!settingsReady) return;
    try { localStorage.setItem(settingsKey, JSON.stringify({ scope: searchScope, location: searchLocation, query: q, reason: connectionReason })); } catch { /* Optional persistence. */ }
  }, [settingsKey, settingsReady, searchScope, searchLocation, q, connectionReason]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FindResponse>({
    sync_users: [],
    exa_people: []
  });
  const [resultsQuery, setResultsQuery] = useState("");
  // Keep the approved learning context with the note, even as the search changes.
  const [drafts, setDrafts] = useState<Map<string, ConnectionDraft>>(new Map());
  useEffect(() => {
    if (!settingsReady) return;
    try { localStorage.setItem(draftsKey, serializeConnectionDrafts(drafts)); } catch { /* Editing still works without browser storage. */ }
  }, [drafts, draftsKey, settingsReady]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function noteContext(p: ExaPerson, searchQuery: string): OutreachContext {
    return parseOutreachContext({ person_title: p.title, person_url: p.url, person_background: p.highlights.join("\n"), search_query: searchQuery, connection_reason: connectionReason });
  }
  function getDraft(p: ExaPerson, searchQuery: string): ConnectionDraft | undefined {
    return drafts.get(connectionDraftKey(noteContext(p, searchQuery)));
  }
  function setDraft(context: OutreachContext, patch: Partial<ConnectionDraft>) {
    setDrafts((prev) => {
      const next = new Map(prev);
      const key = connectionDraftKey(context);
      const current =
        prev.get(key) ?? {
          context,
          shortText: "",
          originalShortText: "",
          generating: false,
          error: "",
          updatedAt: Date.now()
        };
      next.set(key, { ...current, ...patch, updatedAt: Date.now() });
      return next;
    });
  }

  function toggleExpand(url: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  useEffect(() => {
    if (!settingsReady) return;
    if (debounce.current) clearTimeout(debounce.current);
    setSearchError("");
    setResults({ sync_users: [], exa_people: [] });
    if (!q.trim()) {
      setResults({ sync_users: [], exa_people: [] });
      setResultsQuery("");
      setLoading(false);
      return;
    }
    if (searchScope === "local" && !searchLocation.trim() && !isEmail(q)) {
      setSearchError("Enter a city for a local search.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/find-counterpart", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: q.trim(), search_scope: searchScope, search_location: searchScope === "local" ? searchLocation : "", connection_reason: connectionReason }),
          signal: controller.signal
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || j.error || "Search failed. Please try again.");
        if (controller.signal.aborted) return;
        setResultsQuery(discoveryQuery(q.trim(), { scope: searchScope, location: searchLocation }));
        setResults({
          sync_users: j.sync_users ?? [],
          exa_people: j.exa_people ?? []
        });
      } catch (cause) {
        if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : "Search failed. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, searchScope, searchLocation, settingsReady, connectionReason]);

  async function draftOutreach(p: ExaPerson, searchQuery: string) {
    const context = noteContext(p, searchQuery);
    if (drafts.get(connectionDraftKey(context))?.generating) return;
    setDraft(context, {
      generating: true,
      error: ""
    });
    try {
      const r = await fetch("/api/exa-draft-outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...context,
          mode: "connection_note",
          highlights: p.highlights,
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || j.error || "Could not draft a note.");
      if (typeof j.short_message !== "string" || !j.short_message.trim()) throw new Error("No connection note returned. Please try again.");
      const short = capConnectionNote(j.short_message);
      setDraft(context, {
        shortText: short,
        originalShortText: short,
        context: parseOutreachContext({ ...context, person_background: j.person_background || context.person_background }),
        generating: false
      });
    } catch (cause) {
      setDraft(context, { generating: false, error: cause instanceof Error ? cause.message : "Could not draft a note." });
    }
  }

  const searching = q.trim().length > 0;

  function noteEditor(p: ExaPerson, searchQuery: string) {
    const draft = getDraft(p, searchQuery);
    if (!draft) return null;
    return renderNote(draft);
  }

  function renderNote(draft: ConnectionDraft) {
    return <ConnectionNoteEditor
      key={connectionDraftKey(draft.context)}
      context={draft.context}
      draft={draft}
      onChange={(shortText) => setDraft(draft.context, { shortText })}
    />;
  }

  // Twin-suggested connections.
  type Suggestion = {
    rationale: string;
    search_query: string;
    people: ExaPerson[];
  };
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [intent, setIntent] = useState("");
  const [lastIntent, setLastIntent] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const suggestionRequest = useRef<AbortController | null>(null);
  const searchContext = useRef({ intent, reason: connectionReason });
  searchContext.current = { intent, reason: connectionReason };
  // Locally-persisted set of user IDs the viewer has dismissed from the
  // "already on SyncedIn" directory. Stored in localStorage so dismissals
  // stay hidden across page loads without needing a server table.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);
  function dismissUser(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  // Cycling placeholder examples — rotate every ~3s so users see different
  // ways to use the freeform intent box.
  const SAMPLE_INTENTS = [
    "founders building in fintech right now",
    "investors who back AI music platforms",
    "biotech CEOs with humanitarian focus",
    "engineers shipping agentic infra",
    "operators in vertical SaaS",
    "writers covering the AI agent space",
    "lawyers who advise on token launches",
    "people building knowledge graphs",
    "product designers obsessed with retro UI"
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    if (intent.trim()) return; // freeze rotation if user is typing
    const t = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % SAMPLE_INTENTS.length),
      3000
    );
    return () => clearInterval(t);
  }, [intent]);

  // localStorage cache so Find People doesn't re-burn an Exa call every
  // time the user lands on the dashboard. 60-min TTL: long enough that
  // they get instant paint on repeat visits, short enough that new
  // signups feed back into the suggestions on the same day.
  const FIND_TTL_MS = 60 * 60 * 1000;

  async function askTwin(useIntent: string, useCache = false) {
    suggestionRequest.current?.abort();
    const controller = new AbortController();
    suggestionRequest.current = controller;
    setSuggestionError("");
    setSuggestions(null);
    if (searchScope === "local" && !searchLocation.trim()) {
      setSuggestionError("Enter a city for a local search.");
      setSuggesting(false);
      return;
    }
    const reason = searchContext.current.reason;
    const cacheKey = discoveryCacheKey(userId, { scope: searchScope, location: searchLocation }, reason);
    setSuggesting(true);
    // Cache check (only for the empty-intent auto-load case — if the
    // user typed a specific intent we always hit the server fresh).
    if (useCache && !useIntent) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            at: number;
            suggestions: Suggestion[];
          };
          if (
            parsed &&
            Date.now() - parsed.at < FIND_TTL_MS &&
            Array.isArray(parsed.suggestions)
          ) {
            setSuggestions(parsed.suggestions);
            setLastIntent(useIntent);
            setSuggesting(false);
            return;
          }
        }
      } catch {
        /* corrupt cache — fall through and refetch */
      }
    }
    try {
      const r = await fetch("/api/twin-suggest-connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: useIntent, search_scope: searchScope, search_location: searchScope === "local" ? searchLocation : "", connection_reason: reason }),
        signal: controller.signal
      });
      const j = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok) throw new Error(j.detail || j.error || "Could not find people. Please try again.");
      const fresh = j.suggestions ?? [];
      setSuggestions(fresh);
      setLastIntent(useIntent);
      // Only cache the no-intent default suggestions — intent-specific
      // queries are too varied to keep around.
      if (!useIntent) {
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ at: Date.now(), suggestions: fresh })
          );
        } catch {
          /* storage full or disabled — non-fatal */
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setSuggestions([]);
        setSuggestionError(cause instanceof Error ? cause.message : "Could not find people. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) setSuggesting(false);
    }
  }

  // Refresh recommendations when the geographic scope changes; cancel stale requests.
  useEffect(() => {
    if (!settingsReady || searching) return;
    setSuggestions(null);
    setSuggestionError("");
    const timer = setTimeout(() => askTwin(searchContext.current.intent, true), 400);
    return () => { clearTimeout(timer); suggestionRequest.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsReady, searchScope, searchLocation, searching]);

  const visibleDirectory = directory.filter((person) => !dismissed.has(person.id) &&
    (searchScope === "global" || matchesCity(person.location, searchLocation)))
    .sort((a, b) => (b.connection_score || 0) - (a.connection_score || 0));

  const visibleNoteKeys = new Set(searching
    ? results.exa_people.map((person) => connectionDraftKey(noteContext(person, resultsQuery)))
    : (suggestions || []).flatMap((suggestion) => suggestion.people.slice(0, 4).map((person) =>
      connectionDraftKey(noteContext(person, discoveryQuery(lastIntent || suggestion.search_query, { scope: searchScope, location: searchLocation }))))));
  const otherDrafts = Array.from(drafts.entries()).filter(([key]) => !visibleNoteKeys.has(key))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  return (
    <section className="discover-workspace">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Find your people</h2>
        <div className="retro-dim text-xs">
          {loading ? "Searching..." : `${visibleDirectory.length} ready to sync`}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <fieldset className="inline-flex shrink-0 gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border-bright)" }}>
          <legend className="sr-only">Search scope</legend>
          {(["global", "local"] as const).map((scope) => (
            <label key={scope} className="relative cursor-pointer">
              <input type="radio" name="discover-scope" value={scope} checked={searchScope === scope}
                onChange={() => setSearchScope(scope)} className="peer sr-only" disabled={!settingsReady} />
              <span className="inline-flex h-9 w-24 items-center justify-center gap-2 rounded-md text-sm peer-focus-visible:outline peer-focus-visible:outline-2"
                style={{ background: searchScope === scope ? "var(--amber-bright)" : "transparent", color: searchScope === scope ? "white" : "var(--text)" }}>
                {scope === "global" ? <Globe size={16} /> : <MapPin size={16} />}
                {scope === "global" ? "Global" : "Local"}
              </span>
            </label>
          ))}
        </fieldset>
        {searchScope === "local" ? <label className="flex min-w-0 flex-1 items-center gap-2 text-xs" style={{ minWidth: 200 }}>
          <span className="retro-dim shrink-0">Near</span>
          <input aria-label="Local search city" value={searchLocation} maxLength={120}
            onChange={(event) => setSearchLocation(event.target.value)} placeholder="City or metro area" className="retro-input min-w-0" />
        </label> : <span className="retro-dim text-xs">Best fit, anywhere</span>}
      </div>

      <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor="discover-search" className="retro-label block mb-1">Find someone</label>
        <div className="relative">
        <input
          id="discover-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name. Find them on SyncedIn or anywhere on the web."
          className="retro-input"
          style={{ paddingRight: q ? 80 : 16 }}
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="retro-dim hover:text-white"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-bright)",
              background: "var(--panel-2)"
            }}
          >
            × clear
          </button>
        )}
        </div>
      </div>

      <div className="min-w-0">
        <label htmlFor="discover-reason" className="retro-label block mb-1">Reason for connecting <span className="retro-dim normal-case">(optional)</span></label>
        <textarea
          id="discover-reason"
          value={connectionReason}
          onChange={(event) => setConnectionReason(event.target.value)}
          placeholder="e.g. Invite climate founders to a research dinner"
          className="retro-input text-sm"
          rows={2}
          maxLength={CONNECTION_REASON_LIMIT}
        />
      </div>
      </div>
      {searchError && <p role="alert" className="retro-red text-sm mt-2">{searchError}</p>}
      {!searching && searchScope === "local" && searchLocation.trim() && !visibleDirectory.length && (
        <p className="retro-dim text-sm mt-3">No SyncedIn matches near {searchLocation.trim()}.</p>
      )}

      {otherDrafts.length > 0 && <details className="mt-4 border-y py-3" style={{ borderColor: "var(--border)" }}>
        <summary className="cursor-pointer text-sm font-semibold">Saved notes ({otherDrafts.length})</summary>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {otherDrafts.map(([key, draft]) => <article key={key} className="py-4 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold break-words">{draft.context.person_title}</h3>
                <p className="retro-dim text-xs break-words">{draft.context.search_query}</p>
              </div>
              <button type="button" className="retro-btn shrink-0" style={{ width: 44, height: 44, padding: 0 }}
                disabled={draft.generating} aria-label={`Delete note for ${draft.context.person_title}`} title="Delete saved note"
                onClick={() => setDrafts((previous) => { const next = new Map(previous); next.delete(key); return next; })}>
                <Trash2 size={16} className="mx-auto" />
              </button>
            </div>
            {renderNote(draft)}
          </article>)}
        </div>
      </details>}

      {/* Platform-users directory — Jack's call: ALREADY-ON-SYNCEDIN users
          render ABOVE the Find People (Exa) block. They're a higher-value
          surface (zero invite friction) so they get top placement, even
          before the "your twin says" recommendations. Each row shows the
          connection score on the right. */}
      {!searching && (() => {
        const visible = visibleDirectory;
        if (visible.length === 0) return null;
        return (
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <div
                className="retro-label"
                style={{ color: "var(--amber-bright)" }}
              >
                already on SyncedIn
              </div>
              <div className="retro-dim text-xs">
                {visible.length} {visible.length === 1 ? "twin" : "twins"} you
                haven&apos;t talked to yet
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {visible.slice(0, 12).map((p) => {
                const blurb =
                  (looksLikeRealBio(p.goals) ? p.goals : null) ||
                  p.headline_fallback ||
                  "";
                const score = p.connection_score ?? 0;
                const scoreColor =
                  score >= 50
                    ? "var(--amber-bright)"
                    : score >= 25
                      ? "var(--text)"
                      : "var(--text-dim)";
                return (
                  <form
                    action={startConversationWithUser}
                    key={p.id}
                    className="retro-panel retro-panel-hover p-4 flex items-start gap-3"
                    style={{ position: "relative" }}
                  >
                    {/* Avatar — uploaded photo if available, otherwise a
                        deterministic 2-stop gradient circle with initials.
                        Same user always renders to the same gradient. */}
                    <DirectoryAvatar
                      id={p.id}
                      displayName={p.display_name}
                      email={p.email}
                      avatarUrl={p.avatar_url}
                      size={44}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                        <span>{p.display_name || p.email}</span>
                        <ReportAccountButton reportedUserId={p.id} reportedName={p.display_name || undefined} />
                        {/* NEW pill — surfaces signups from the last 14
                            days so the user knows who's actively building
                            their twin RIGHT NOW. Jack: "move those new
                            people up top." */}
                        {p.created_at_ms &&
                          Date.now() - p.created_at_ms <
                            14 * 86_400_000 && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: "0.1em",
                                padding: "2px 6px",
                                borderRadius: 999,
                                background: "var(--amber-bright)",
                                color: "#000",
                                textTransform: "uppercase"
                              }}
                            >
                              new
                            </span>
                          )}
                      </div>
                      {blurb && (
                        <div className="retro-dim text-xs mt-1 line-clamp-2">
                          {blurb}
                        </div>
                      )}
                    </div>
                    <input type="hidden" name="userId" value={p.id} />
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div
                        className="text-xs font-mono"
                        style={{
                          color: scoreColor,
                          letterSpacing: "0.04em",
                          fontWeight: 700
                        }}
                        title="Estimated connection score: how much of your twin's profile overlaps with theirs. Updates as both twins add context."
                      >
                        {score}% sync
                      </div>
                      <button
                        type="submit"
                        className="retro-btn retro-btn-primary text-xs"
                      >
                        connect &gt;
                      </button>
                    </div>
                    {/* Small X — dismiss this user from the directory. Stays
                        hidden across page loads via localStorage. Stops
                        form propagation so it doesn't accidentally fire
                        startConversationWithUser.
                        Positioned at the TOP-LEFT corner (not top-right)
                        so it can't visually overlap the "{score}% sync"
                        label and "connect >" button stacked on the right. */}
                    <button
                      type="button"
                      aria-label={`Dismiss ${p.display_name || p.email}`}
                      title="Not interested — hide this person"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dismissUser(p.id);
                      }}
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--panel-solid)",
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        fontSize: 11,
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        // Sits above the avatar circle; very low opacity
                        // until row-hover so it doesn't dominate. Mobile
                        // taps still hit it via the 20×20 target.
                        opacity: 0.55,
                        transition: "opacity 120ms ease"
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "0.55";
                      }}
                    >
                      ✕
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Twin-recommended connections */}
      {!searching && (
        <div className="mt-6">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => askTwin(intent.trim())}
              disabled={suggesting || !settingsReady || (searchScope === "local" && !searchLocation.trim())}
              className="retro-btn retro-btn-primary shrink-0"
            >
              {suggesting ? (
                <DotsLoader label="searching" />
              ) : (
                "Find people"
              )}
            </button>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value.slice(0, 280))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  askTwin(intent.trim());
                }
              }}
              placeholder={
                intent
                  ? ""
                  : `e.g. "${SAMPLE_INTENTS[placeholderIdx]}"`
              }
              className="retro-input flex-1"
              maxLength={280}
            />
          </div>
          <div
            className="retro-dim text-xs mt-2"
            style={{ minHeight: 18 }}
          >
            {lastIntent
              ? `searched: "${lastIntent}"`
              : "Leave it blank to let your twin pick. Or type any intent — your twin combines it with your own context to find the right people."}
          </div>

          {suggestionError && <p role="alert" className="retro-red text-sm mt-2">{suggestionError}</p>}
          {suggestions && suggestions.length === 0 && !suggesting && !suggestionError && (
            <p className="retro-dim text-sm mt-3">
              Your twin didn&apos;t surface any matches. Try adding more
              context to your twin in onboarding.
            </p>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="mt-4 space-y-5">
              {suggestions.map((s, idx) => (
                <div key={idx}>
                  {/*
                    Redesigned intent header. Old version used `retro-label`
                    which is the site-wide all-caps mono treatment meant
                    for section TAGS, not actual content — when the
                    rationale was a real sentence ("I need hungry
                    operators who...") it read as scary terminal output
                    and crowded the results below. Now: a rounded "your
                    twin's read" quote card with normal-case prose +
                    a real pill button for re-running the search.
                  */}
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: "var(--panel-2)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--amber-bright)33",
                        color: "var(--amber-bright)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 800,
                        fontFamily: "Georgia, serif",
                        lineHeight: 1
                      }}
                    >
                      ‟
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="text-xs"
                        style={{
                          color: "var(--text-dim)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontWeight: 700,
                          marginBottom: 4
                        }}
                      >
                        your twin&apos;s read
                      </div>
                      <div
                        className="text-sm"
                        style={{
                          color: "var(--text)",
                          lineHeight: 1.5
                        }}
                        title={`searched: ${s.search_query}`}
                      >
                        {s.rationale}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => askTwin(s.search_query)}
                      disabled={suggesting}
                      title="Re-run this intent to surface fresh matches"
                      style={{
                        flexShrink: 0,
                        alignSelf: "center",
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: "1px solid var(--border-bright)",
                        background: "var(--panel-solid)",
                        color: "var(--text)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: suggesting ? "default" : "pointer",
                        opacity: suggesting ? 0.5 : 1,
                        whiteSpace: "nowrap"
                      }}
                    >
                      ↻ find more
                    </button>
                  </div>
                  {s.people.length === 0 ? (
                    <p className="retro-dim text-sm mt-2">
                      No matches for this one.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {s.people.slice(0, 4).map((p) => {
                        const searchQuery = discoveryQuery(lastIntent || s.search_query, { scope: searchScope, location: searchLocation });
                        const draft = getDraft(p, searchQuery);
                        const isOpen = expanded.has(p.url);
                        const preview = p.highlights[0]
                          ? p.highlights[0].length > 140
                            ? p.highlights[0].slice(0, 140) + "…"
                            : p.highlights[0]
                          : "";
                        return (
                          <li
                            key={p.url}
                            className="retro-panel retro-panel-hover p-3"
                            onClick={() => toggleExpand(p.url)}
                            style={{ cursor: "pointer" }}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-left flex-1 min-w-0">
                                <div className="font-semibold text-sm">
                                  {p.title}
                                </div>
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="retro-dim text-xs mt-0.5 underline hover:text-white block"
                                  style={{ wordBreak: "break-all" }}
                                >
                                  {p.url}
                                </a>
                                {!isOpen && preview && (
                                  <div
                                    className="retro-dim text-xs mt-1 line-clamp-2"
                                  >
                                    {preview}
                                  </div>
                                )}
                              </div>
                              <div
                                className="flex flex-wrap items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(p.url)}
                                  title={isOpen ? "Collapse details" : "See the full scrape"}
                                  aria-label={
                                    isOpen ? "Collapse details" : "Expand details"
                                  }
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 999,
                                    border: "1px solid var(--border)",
                                    background: "transparent",
                                    color: "var(--text-dim)",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 14,
                                    lineHeight: 1
                                  }}
                                >
                                  {isOpen ? "−" : "+"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => draftOutreach(p, searchQuery)}
                                  disabled={!!draft?.generating}
                                  // Primary CTA — promote the "draft invite"
                                  // action so it's visually the strongest
                                  // affordance on the row, not the equal
                                  // weight retro-btn it was.
                                  className="retro-btn retro-btn-primary inline-flex items-center gap-2 text-sm"
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  {draft?.generating ? (
                                    <DotsLoader label="Drafting" />
                                  ) : draft?.shortText ? (
                                    <><RotateCw size={14} /> Redraft</>
                                  ) : (
                                    <><Pencil size={14} /> Draft invite</>
                                  )}
                                </button>
                                {!draft && <button type="button" onClick={() => setDraft(noteContext(p, searchQuery), {})}
                                  className="retro-btn inline-flex items-center gap-1 text-xs" title="Write or paste a connection note">
                                  <Pencil size={14} /> Write note
                                </button>}
                              </div>
                            </div>
                            {isOpen && p.highlights.length > 0 && (
                              <div className="mt-3 space-y-2 text-sm">
                                {p.highlights.map((h, i) => (
                                  <p key={i}>{h}</p>
                                ))}
                              </div>
                            )}
                            {noteEditor(p, searchQuery)}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state — only shown when there are no platform users left
          to discover. The full directory list now renders above (right
          under the search input) so we only fall through to this when
          everyone you could connect to is already in a conversation. */}
      {!searching && directory.length === 0 && (
        <div className="mt-4">
          <div className="retro-panel p-4 text-sm">
            <div className="font-semibold">
              You&apos;re caught up on platform discovery.
            </div>
            <div className="retro-dim mt-1">
              Search above for anyone — your twin will draft an invite if
              they aren&apos;t on SyncedIn yet.
            </div>
          </div>
        </div>
      )}

      {/* Search results — capped so the chats below stay reachable */}
      {searching && !searchError && (
        <div
          className="mt-4 space-y-5"
          style={{
            maxHeight: "60vh",
            overflowY: "auto",
            paddingRight: 4
          }}
        >
          {/* Email shortcut */}
          {isEmail(q) && (
            <div className="retro-panel p-3">
              <Link
                href={`/conversations/new?error=`}
                className="retro-btn retro-btn-primary text-sm"
              >
                &gt; Open conversation with {q.trim().toLowerCase()}
              </Link>
            </div>
          )}

          {/* SyncedIn matches */}
          <div>
            <div className="retro-label">on syncedin</div>
            {loading && results.sync_users.length === 0 ? (
              <p className="retro-dim text-sm mt-2">Searching…</p>
            ) : results.sync_users.length === 0 ? (
              <p className="retro-dim text-sm mt-2">No SyncedIn users matched.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {results.sync_users.map((u) => (
                  <li
                    key={u.id}
                    className="retro-panel retro-panel-hover p-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-sm">
                        {u.display_name || "Unnamed twin"}
                      </div>
                      {u.email && (
                        <div className="retro-dim text-xs">{u.email}</div>
                      )}
                    </div>
                    <form action={startConversationWithUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button className="retro-btn retro-btn-primary text-sm">
                        &gt; open
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Exa web results */}
          {!isEmail(q) && (
            <div>
              <div className="retro-label">found on the web</div>
              {loading && results.exa_people.length === 0 ? (
                <p className="retro-dim text-sm mt-2">Checking the web…</p>
              ) : results.exa_people.length === 0 ? (
                <p className="retro-dim text-sm mt-2">
                  No web matches. Try a fuller name or add their company.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {results.exa_people.map((p) => {
                    const draft = getDraft(p, resultsQuery);
                    const isOpen = expanded.has(p.url);
                    const preview = p.highlights[0]
                      ? p.highlights[0].length > 140
                        ? p.highlights[0].slice(0, 140) + "…"
                        : p.highlights[0]
                      : "";
                    return (
                      <li
                        key={p.url}
                        className="retro-panel retro-panel-hover p-3"
                        onClick={() => toggleExpand(p.url)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="text-left flex-1 min-w-0">
                            <div
                              className="text-left font-semibold text-sm"
                              style={{ color: "var(--text)" }}
                            >
                              {p.title}
                            </div>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="retro-dim text-xs mt-0.5 underline hover:text-white block"
                              style={{ wordBreak: "break-all" }}
                            >
                              {p.url}
                            </a>
                            {!isOpen && preview && (
                              <div
                                className="retro-dim text-xs mt-1 line-clamp-1"
                              >
                                {preview}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(p.url);
                              }}
                              className="retro-dim text-xs hover:text-white"
                            >
                              {isOpen ? "− collapse" : "+ expand"}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                draftOutreach(p, resultsQuery);
                              }}
                              disabled={!!draft?.generating}
                              className="retro-btn inline-flex items-center gap-2 text-sm"
                            >
                              {draft?.generating ? (
                                <DotsLoader label="Drafting" />
                              ) : draft?.shortText ? (
                                <><RotateCw size={14} /> Redraft</>
                              ) : (
                                <><Pencil size={14} /> Draft invite</>
                              )}
                            </button>
                            {!draft && <button type="button" onClick={(event) => { event.stopPropagation(); setDraft(noteContext(p, resultsQuery), {}); }}
                              className="retro-btn inline-flex items-center gap-1 text-xs" title="Write or paste a connection note">
                              <Pencil size={14} /> Write note
                            </button>}
                          </div>
                        </div>

                        {isOpen && p.highlights.length > 0 && (
                          <div className="mt-3 space-y-2 text-sm">
                            {p.highlights.map((h, i) => (
                              <p key={i}>{h}</p>
                            ))}
                          </div>
                        )}

                        {noteEditor(p, resultsQuery)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
