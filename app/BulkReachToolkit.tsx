"use client";

import { useEffect, useState } from "react";
import { proxiedAvatar } from "@/lib/avatar";

/**
 * Every channel we can give a human to move many invites at once.
 * Designed to live both inside the dashboard invite card AND as the
 * primary CTA at the end of the Hypernetwork page.
 */
export function BulkReachToolkit({
  appUrl,
  variant = "card"
}: {
  appUrl: string;
  variant?: "card" | "hero";
}) {
  // Default broadcast copy — replaced on mount with a twin-voice version
  // from /api/twin-broadcast-message so every channel (iMessage, WhatsApp,
  // Email, Tweet, Reddit, ...) sends a message that actually sounds like
  // the inviter, not generic platform boilerplate.
  const defaultMessage = `I'm on SyncedIn — an agent-to-agent protocol where two people's digital twins talk to each other and find the highest win-win between them. Worth 90 seconds. Join me: ${appUrl}`;
  const defaultTweet = `Two digital twins, one win-win.\n\nJust joined SyncedIn — your clone talks to my clone, surfaces the deal, you walk in already knowing. ${appUrl}`;
  const [inviteMessage, setInviteMessage] = useState<string>(defaultMessage);
  const [inviteTweet, setInviteTweet] = useState<string>(defaultTweet);
  const [voiceMode, setVoiceMode] = useState<"loading" | "twin" | "default">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    // Cache for the session so navigating between tabs doesn't refire Claude.
    const cached =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("syncedin.twinBroadcastMsg")
        : null;
    if (cached) {
      try {
        const j = JSON.parse(cached);
        if (j?.message) setInviteMessage(j.message);
        if (j?.tweet) setInviteTweet(j.tweet);
        if (j?.voice) setVoiceMode(j.voice);
        return;
      } catch {
        /* fall through to fetch */
      }
    }
    fetch("/api/twin-broadcast-message")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.message) setInviteMessage(j.message);
        if (j?.tweet) setInviteTweet(j.tweet);
        setVoiceMode(j?.voice === "twin" ? "twin" : "default");
        try {
          sessionStorage.setItem(
            "syncedin.twinBroadcastMsg",
            JSON.stringify(j)
          );
        } catch {
          /* private mode */
        }
      })
      .catch(() => {
        if (!cancelled) setVoiceMode("default");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [copied, setCopied] = useState<string | null>(null);
  const [contactPickerSupported, setContactPickerSupported] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  // Richer contact entries: name + ANY of {email, phone, profile URL}.
  // The contact field auto-classifies the input so the user can paste
  // whatever they have for that person — even a LinkedIn / X / IG / FB
  // profile URL. When a profile URL is provided, the server scrapes it
  // and uses the result to personalize the invite opener.
  const [entries, setEntries] = useState<
    Array<{
      name: string;
      email?: string;
      phone?: string;
      profile_url?: string;
    }>
  >([]);
  const [entryName, setEntryName] = useState("");
  const [entryContact, setEntryContact] = useState("");

  // Rotating placeholder for the contact field — cycles real-looking
  // examples from each supported platform so the input demonstrates
  // multi-platform support without static "or, or, or" copy. Pauses
  // rotation when the user is typing or the field has focus.
  const CONTACT_EXAMPLES = [
    "linkedin.com/in/lucas-chu",
    "x.com/jackjayio",
    "instagram.com/jackjay.io",
    "facebook.com/zuck",
    "alex@example.com",
    "+1 415 555 0142"
  ];
  const [examplePos, setExamplePos] = useState(0);
  const [contactFocused, setContactFocused] = useState(false);
  useEffect(() => {
    if (entryContact.length > 0 || contactFocused) return;
    const t = setInterval(() => {
      setExamplePos((i) => (i + 1) % CONTACT_EXAMPLES.length);
    }, 2200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryContact.length === 0, contactFocused]);

  // Recognize handles / URLs for LinkedIn, X / Twitter, Instagram, Facebook.
  const SOCIAL_HOSTS_RE =
    /(?:linkedin\.com|x\.com|twitter\.com|instagram\.com|facebook\.com|fb\.com)\b/i;

  function classifyContact(s: string): {
    email?: string;
    phone?: string;
    profile_url?: string;
    derived_name?: string;
  } {
    const t = s.trim();
    if (!t) return {};

    // Profile URL (handles bare domains too — e.g. "linkedin.com/in/foo")
    if (SOCIAL_HOSTS_RE.test(t)) {
      let url = t;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      // Try to derive a friendly name from the handle path.
      // Strip LinkedIn's alphanumeric ID suffix (e.g. /in/nick-linck-417b0ba
      // → "Nick Linck", not "Nick Linck 417B0Ba"). Same logic as the
      // server-side nameFromProfileUrl in /api/bulk-create-invites.
      let derived = "";
      try {
        const parsed = new URL(url);
        const seg = parsed.pathname
          .split("/")
          .filter(Boolean)
          .filter((s) => s !== "in") // linkedin uses /in/handle
          .pop();
        if (seg) {
          derived = seg
            .replace(/-+[a-z0-9]*\d[a-z0-9]*$/i, "")
            .replace(/[-_]+/g, " ")
            .replace(/\d+$/, "")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
          derived = derived
            .split(/\s+/)
            .filter((w) => !/\d/.test(w))
            .join(" ")
            .trim();
        }
      } catch {
        /* malformed URL */
      }
      return { profile_url: url, derived_name: derived || undefined };
    }
    // Email
    if (/@/.test(t)) return { email: t.toLowerCase() };
    // Phone (digits + leading + only).
    const digits = t.replace(/[^\d+]/g, "");
    if (digits.replace(/\D/g, "").length >= 7) return { phone: digits };
    return {};
  }

  function profileLabel(url?: string): string {
    if (!url) return "";
    if (/linkedin\.com/i.test(url)) return "LinkedIn";
    if (/(x|twitter)\.com/i.test(url)) return "X";
    if (/instagram\.com/i.test(url)) return "Instagram";
    if (/(facebook|fb)\.com/i.test(url)) return "Facebook";
    return "Profile";
  }
  const [csvError, setCsvError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [importHelp, setImportHelp] = useState<null | "linkedin" | "google">(
    null
  );
  const [personalized, setPersonalized] = useState<
    Array<{
      contact: { name: string; email?: string; phone?: string };
      slug: string;
      url: string;
      starter: string;
    }>
  >([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Persistence — the personalized list survives reloads. The user
  // generates invites, walks away, comes back tomorrow; the row is
  // still there with the link + "send via" buttons until they
  // explicitly tick "✓ invite sent". Then it's removed from the visible
  // list. Storage key is intentionally non-user-scoped because we don't
  // know the user id in this client component; collisions across logged-
  // in users on the same browser are unlikely + low-risk.
  const STORAGE_KEY = "syncedin.personalizedInvites.v1";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPersonalized(parsed);
      }
    } catch {
      /* corrupted storage — ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(personalized));
    } catch {
      /* quota / private mode */
    }
  }, [personalized, hydrated]);

  /** Remove a single personalized invite from the visible list +
   *  persisted storage. Triggered by the "mark as sent?" button on
   *  each row. The actual pending_invites DB row stays — only the
   *  client-side reminder is cleared. */
  function markInviteSent(slug: string) {
    setPersonalized((prev) => prev.filter((p) => p.slug !== slug));
  }

  /** Update an edit-in-place starter for a personalized invite row.
   *  The new text persists to localStorage (alongside the rest of the
   *  personalized list) so reloads keep the user's edits. Send buttons
   *  (SMS / WA / Email / copy) read the current starter so the user's
   *  edits flow into the actual outbound message. */
  function updateStarter(slug: string, text: string) {
    setPersonalized((prev) =>
      prev.map((p) => (p.slug === slug ? { ...p, starter: text } : p))
    );
  }

  useEffect(() => {
    setContactPickerSupported(
      typeof navigator !== "undefined" && !!(navigator as any).contacts?.select
    );
  }, []);

  function flash(label: string) {
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(() => flash(label));
  }

  async function pickFromContacts() {
    try {
      const props = ["email"];
      const opts = { multiple: true };
      const contacts = await (navigator as any).contacts.select(props, opts);
      const found: string[] = [];
      for (const c of contacts) {
        for (const e of c.email || []) {
          if (typeof e === "string") found.push(e.toLowerCase());
        }
      }
      setEmails((prev) => Array.from(new Set([...prev, ...found])));
    } catch {
      /* user cancelled */
    }
  }

  // Parse LinkedIn / Google CSV imports into structured entries.
  // LinkedIn's official Connections.csv has columns:
  //   First Name, Last Name, URL, Email Address, Company, Position, Connected On
  // (sometimes with a "Notes:" preamble at the top — skip rows until we hit
  // the header.) We pull Name + URL + Email so every connection lands as a
  // proper entry with a profile_url, which the scraper chain can then
  // personalize against. Falls back to the old email-regex behavior when
  // the file doesn't look like a structured CSV.
  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/);

      // Find the header row.
      let headerIdx = -1;
      for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const lower = lines[i].toLowerCase();
        if (
          (lower.includes("first name") ||
            lower.includes("given name") ||
            lower.includes("name")) &&
          (lower.includes("url") ||
            lower.includes("email") ||
            lower.includes("profile"))
        ) {
          headerIdx = i;
          break;
        }
      }

      // Simple comma-aware CSV row splitter (handles double-quoted fields).
      const splitRow = (row: string): string[] => {
        const out: string[] = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
          const c = row[i];
          if (c === '"') {
            if (inQuotes && row[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (c === "," && !inQuotes) {
            out.push(cur);
            cur = "";
          } else {
            cur += c;
          }
        }
        out.push(cur);
        return out.map((s) => s.trim());
      };

      // Structured-CSV path.
      if (headerIdx !== -1) {
        const header = splitRow(lines[headerIdx]).map((h) =>
          h.toLowerCase().replace(/^"|"$/g, "")
        );
        const idxOf = (...names: string[]) =>
          header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
        const firstNameIdx = idxOf("first name", "given name");
        const lastNameIdx = idxOf("last name", "family name", "surname");
        const fullNameIdx = idxOf("name");
        const urlIdx = idxOf("url", "profile url", "profile");
        const emailIdx = idxOf("email address", "email");
        const companyIdx = idxOf("company", "organization");

        const newEntries: Array<{
          name: string;
          email?: string;
          profile_url?: string;
        }> = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const raw = lines[i];
          if (!raw.trim()) continue;
          const cells = splitRow(raw);
          const fn =
            firstNameIdx >= 0 ? cells[firstNameIdx] || "" : "";
          const ln = lastNameIdx >= 0 ? cells[lastNameIdx] || "" : "";
          const full =
            fullNameIdx >= 0 && firstNameIdx === -1
              ? cells[fullNameIdx] || ""
              : "";
          const name = (
            [fn, ln].filter(Boolean).join(" ").trim() || full.trim()
          );
          const url = urlIdx >= 0 ? cells[urlIdx] || "" : "";
          const email = emailIdx >= 0 ? cells[emailIdx] || "" : "";
          // Need at least a name+url OR a name+email to be useful.
          if (!name && !email && !url) continue;
          newEntries.push({
            name,
            email: email ? email.toLowerCase() : undefined,
            profile_url:
              url && /^https?:\/\//i.test(url) ? url : undefined
          });
        }

        if (newEntries.length > 0) {
          setEntries((prev) => {
            const seen = new Set(
              prev.map((p) => `${p.name}|${p.email || ""}|${p.profile_url || ""}`)
            );
            const merged = [...prev];
            for (const e of newEntries) {
              const k = `${e.name}|${e.email || ""}|${e.profile_url || ""}`;
              if (!seen.has(k)) {
                seen.add(k);
                merged.push(e);
              }
            }
            return merged;
          });
          flash(`+${newEntries.length} contacts`);
          e.target.value = "";
          return;
        }
      }

      // Fallback: plain regex sweep for emails (old behavior).
      const found = Array.from(
        text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
      ).map((m) => m[0].toLowerCase());
      if (found.length === 0) {
        setCsvError(
          "Couldn't find name+URL columns or emails in that file. Expected the LinkedIn 'Connections.csv' or a similar structured export."
        );
      } else {
        setEmails((prev) => Array.from(new Set([...prev, ...found])));
        flash(`+${found.length} emails`);
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  // Pending set — entries currently being generated. Used to show
  // "generating…" rows in the personalized list while the API is in
  // flight so the user has immediate feedback after each add.
  const [pendingNames, setPendingNames] = useState<string[]>([]);

  /**
   * Fire bulk-create-invites for an arbitrary list of contacts. Used by:
   *   - addEntry()         → auto-fires for the single contact just added
   *   - CSV import path    → fires for all imported rows
   *   - manual button      → fires for whatever's in `entries` (rare now,
   *                          mostly relevant if auto-generate failed and
   *                          the user wants a retry)
   * Results append to the personalized list. Each contact moves through
   * pendingNames so the UI can show its "generating" state.
   */
  async function generateForContacts(
    contacts: Array<{
      name: string;
      email?: string;
      phone?: string;
      profile_url?: string;
    }>
  ) {
    if (contacts.length === 0) return;
    setGenError(null);
    setPendingNames((prev) => [
      ...prev,
      ...contacts.map((c) => c.name || c.email || c.phone || "anon")
    ]);
    setGenerating(true);
    try {
      const r = await fetch("/api/bulk-create-invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contacts })
      });
      const j = await r.json();
      if (j.error) {
        setGenError(j.detail || j.error);
        return;
      }
      // New results PREPEND to the list — the entry the user just added
      // should be the first thing they see (right under the generating
      // placeholder, which is also at the top). Older results stay below.
      setPersonalized((prev) => [...(j.results ?? []), ...prev]);
    } catch {
      setGenError("Couldn't reach the server.");
    } finally {
      setGenerating(false);
      setPendingNames((prev) =>
        prev.filter(
          (n) =>
            !contacts.some(
              (c) => (c.name || c.email || c.phone || "anon") === n
            )
        )
      );
    }
  }

  function addEntry() {
    const typed = entryName.trim();
    const { email, phone, profile_url, derived_name } =
      classifyContact(entryContact);
    // Full name field was removed from the UI. Name is now derived from:
    //   - Profile URL handle (derived_name), OR
    //   - CSV import (typed via setEntryName during CSV parse), OR
    //   - Whatever the email-local part / phone number gives us as a fallback.
    // The server-side scrape + Exa lookup fills in the rest, so we no longer
    // refuse entries that lack a typed name.
    const name =
      typed ||
      derived_name ||
      (email ? email.split("@")[0]!.replace(/[._\-+]/g, " ") : "") ||
      "";
    if (!email && !phone && !profile_url) return;
    const newEntry = { name, email, phone, profile_url };
    // INTENTIONALLY don't push into `entries` — auto-fire owns the
    // generation, the result lives in `personalized`, pendingNames
    // shows the in-flight state. Adding to entries would resurrect
    // the "+ generate N personalized invites" CTA for an entry that's
    // already been processed.
    setEntryName("");
    setEntryContact("");
    // AUTO-GENERATE the personalized invite for this single entry the
    // moment it's added. No "+ generate" click required — the result
    // streams into the personalized panel below within a few seconds.
    generateForContacts([newEntry]);
  }

  // Live classification of whatever's currently typed in the contact field
  // — drives the dynamic "Full name (optional)" / "Full name (required)"
  // label on the name input, AND triggers the instant-fire path below.
  const liveClassified = classifyContact(entryContact);
  const nameIsOptional = !!liveClassified.profile_url;

  // INSTANT FIRE — when the user pastes a profile URL into the contact
  // field, debounce ~450ms, then auto-add + generate without requiring
  // the "+ add" click. Name comes from the URL handle (derived_name),
  // so there's nothing for the user to type. Field clears after firing
  // so they can immediately paste the next URL.
  //
  // Only triggers for profile URLs — email and phone still need a name,
  // which means they still need the manual + add path so the user can
  // type the name first.
  useEffect(() => {
    const c = liveClassified;
    if (!c.profile_url) return;
    const url = c.profile_url;
    const derivedName = c.derived_name || "";
    // Don't double-fire if the same URL is already pending or done.
    const sigName = derivedName || url;
    if (pendingNames.includes(sigName)) return;
    if (personalized.some((p) => p.contact.name === derivedName)) return;
    const t = setTimeout(() => {
      // Re-check the field hasn't changed under us (user kept typing).
      if (!entryContact.includes(url.replace(/^https?:\/\//i, ""))) return;
      const entry = { name: derivedName, profile_url: url };
      // Same intentional skip-of-entries as addEntry — auto-fire owns
      // the generation, no need to leak this into the entries list and
      // resurrect the bulk CTA.
      setEntryName("");
      setEntryContact("");
      generateForContacts([entry]);
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryContact]);

  // Kept as a manual retry / batch path (e.g., after CSV import or a
  // failed auto-generate). The primary flow is auto-fire from addEntry.
  async function generatePersonalized() {
    const contacts =
      entries.length > 0
        ? entries
        : emails.map((e) => ({ email: e, name: "" }));
    if (contacts.length === 0) {
      setGenError(
        "Add at least one name+email above, or import a CSV first."
      );
      return;
    }
    await generateForContacts(contacts);
    setEntries([]);
    setEmails([]);
  }

  function gmailUrl(): string {
    const to = encodeURIComponent(emails.slice(0, 100).join(","));
    const subj = encodeURIComponent("Join me on SyncedIn");
    const body = encodeURIComponent(inviteMessage);
    return `https://mail.google.com/mail/?view=cm&fs=1&bcc=${to}&su=${subj}&body=${body}`;
  }
  function mailtoUrl(): string {
    const to = "";
    const bcc = encodeURIComponent(emails.join(","));
    const subj = encodeURIComponent("Join me on SyncedIn");
    const body = encodeURIComponent(inviteMessage);
    return `mailto:${to}?bcc=${bcc}&subject=${subj}&body=${body}`;
  }

  const channels: Array<{
    icon: string;
    label: string;
    href?: string;
    onClick?: () => void;
    note: string;
  }> = [
    {
      icon: "💬",
      label: "iMessage / SMS",
      href: `sms:?&body=${encodeURIComponent(inviteMessage)}`,
      note: "opens your messages app, prefilled. tap a recipient and send."
    },
    {
      icon: "🟢",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`,
      note: "open WhatsApp with the invite ready to send to anyone."
    },
    {
      icon: "✉️",
      label: "Email (mailto)",
      href: mailtoUrl(),
      note:
        emails.length > 0
          ? `bcc ${emails.length} contacts in your default email app.`
          : "opens your default email app with the invite ready."
    },
    {
      icon: "📧",
      label: "Gmail compose",
      href: gmailUrl(),
      note:
        emails.length > 0
          ? `bcc ${emails.length} contacts in Gmail web.`
          : "open Gmail compose with the invite prefilled."
    },
    {
      icon: "𝕏",
      label: "Tweet it",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        inviteTweet
      )}`,
      note:
        voiceMode === "twin"
          ? "tweet drafted in your twin's voice — broadcast to your X followers."
          : "broadcast to your X followers."
    },
    {
      icon: "💼",
      label: "Import LinkedIn CSV",
      onClick: () => setImportHelp("linkedin"),
      note:
        "export your connections from LinkedIn → upload here → we make a custom URL per person."
    },
    {
      icon: "📋",
      label: "Reddit / forum",
      onClick: () => copy(inviteMessage, "msg"),
      note: "copy the message, paste into any community you're part of."
    },
    {
      icon: "🔗",
      label: "Copy invite link",
      onClick: () => copy(appUrl, "link"),
      note: appUrl
    },
    ...(contactPickerSupported
      ? [
          {
            icon: "📱",
            label: "Phone contacts",
            onClick: pickFromContacts,
            note: "pick contacts directly from your phone (mobile only)."
          }
        ]
      : []),
    {
      icon: "👥",
      label: "Import Google Contacts CSV",
      onClick: () => setImportHelp("google"),
      note:
        "export contacts from Google → upload here → we make a custom URL per person."
    },
    {
      icon: "📲",
      label: "Show QR code",
      onClick: () => setQrOpen((v) => !v),
      note: "paste-free in-person: someone scans, lands on SyncedIn."
    }
  ];

  const heroMode = variant === "hero";

  return (
    <div
      className={heroMode ? "retro-panel retro-shadow" : ""}
      style={{
        padding: heroMode ? 28 : 0,
        background: heroMode
          ? "radial-gradient(900px 600px at 30% 0%, rgba(58, 77, 255, 0.08), transparent 60%), radial-gradient(800px 500px at 80% 100%, rgba(160, 96, 255, 0.08), transparent 60%), var(--panel-solid)"
          : undefined
      }}
    >
      {heroMode && (
        <>
          <div className="retro-label">help humanity sync</div>
          <h2
            className="retro-h1 text-3xl sm:text-4xl mt-3 leading-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            Invite your friends.
          </h2>
          <p
            className="mt-3 text-base leading-relaxed"
            style={{ color: "var(--text-dim)", maxWidth: 640 }}
          >
            The hypernetwork only works once the people you actually want to
            coordinate with are inside it. Every channel below moves invites
            in bulk. Pick the one that fits the audience.
          </p>
        </>
      )}

      {/* People list — UPGRADED hero panel. Three-step visual hierarchy
          (paste → generate → send) so the user knows what's coming before
          they touch anything. Gradient ring around the panel + a glowing
          accent bar at the top draws the eye here first. */}
      <div
        className="mt-5"
        style={{
          position: "relative",
          padding: 22,
          borderRadius: 18,
          background: "var(--panel-solid)",
          border: "1px solid var(--border)",
          boxShadow: "0 18px 50px -28px rgba(31, 139, 255, 0.28)",
          overflow: "hidden"
        }}
      >
        {/* Animated accent bar — same brand-gradient sweep we use on the
            mobile drawer. Anchors the panel as the primary surface on
            the page without screaming. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background:
              "linear-gradient(90deg, #1f8bff 0%, #6b2dc9 25%, #d83bff 50%, #6b2dc9 75%, #1f8bff 100%)",
            backgroundSize: "200% 100%",
            animation: "brtSweep 5s linear infinite"
          }}
        />
        <style>{`
          @keyframes brtSweep {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }
          .brt-step {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 999px;
            background: var(--panel-2);
            border: 1px solid var(--border);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
            color: var(--text-dim);
          }
          .brt-step.active {
            color: #1f8bff;
            border-color: rgba(31, 139, 255, 0.5);
            background: rgba(31, 139, 255, 0.08);
          }
          .brt-step .num {
            width: 16px;
            height: 16px;
            border-radius: 999px;
            background: var(--panel-solid);
            border: 1px solid var(--border);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 800;
          }
          .brt-step.active .num {
            background: #1f8bff;
            color: #fff;
            border-color: #1f8bff;
          }
          .brt-input-wrap {
            position: relative;
            flex: 1 1 320px;
            min-width: 0;
          }
          .brt-input-wrap .brt-input {
            width: 100%;
            font-size: 15px !important;
            padding: 14px 16px !important;
            border-radius: 12px !important;
            border: 1.5px solid var(--border) !important;
            background: var(--panel-2) !important;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
          }
          .brt-input-wrap .brt-input:focus {
            outline: none;
            border-color: #1f8bff !important;
            box-shadow: 0 0 0 4px rgba(31, 139, 255, 0.12);
          }
        `}</style>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12
          }}
        >
          <span
            className={`brt-step ${
              entries.length === 0 && emails.length === 0 ? "active" : ""
            }`}
          >
            <span className="num">1</span>
            <span>Add contacts</span>
          </span>
          <span style={{ color: "var(--text-dim)" }} aria-hidden="true">
            →
          </span>
          <span
            className={`brt-step ${
              (entries.length > 0 || emails.length > 0) &&
              personalized.length === 0
                ? "active"
                : ""
            }`}
          >
            <span className="num">2</span>
            <span>Generate twin-voice invites</span>
          </span>
          <span style={{ color: "var(--text-dim)" }} aria-hidden="true">
            →
          </span>
          <span
            className={`brt-step ${
              personalized.length > 0 ? "active" : ""
            }`}
          >
            <span className="num">3</span>
            <span>Send</span>
          </span>
        </div>

        <h3
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            lineHeight: 1.2
          }}
        >
          Who do you want to invite?
        </h3>
        <p
          className="text-sm"
          style={{
            color: "var(--text-dim)",
            margin: "8px 0 16px",
            lineHeight: 1.5
          }}
        >
          Drop a{" "}
          <PlatformChip name="LinkedIn" domain="linkedin.com" /> ·{" "}
          <PlatformChip name="X" domain="x.com" /> ·{" "}
          <PlatformChip name="Instagram" domain="instagram.com" /> ·{" "}
          <PlatformChip name="Facebook" domain="facebook.com" /> URL and
          we&apos;ll scrape the rest. Or paste an email / phone and we&apos;ll
          pull what we can from public records.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="brt-input-wrap">
            <input
              type="text"
              placeholder={CONTACT_EXAMPLES[examplePos]}
              value={entryContact}
              onChange={(e) => setEntryContact(e.target.value)}
              onFocus={() => setContactFocused(true)}
              onBlur={() => setContactFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
              className="brt-input"
            />
          </div>
          <button
            type="button"
            onClick={addEntry}
            disabled={!entryContact.trim()}
            className="retro-btn retro-btn-primary"
            style={{
              fontSize: 14,
              padding: "12px 18px",
              borderRadius: 12
            }}
          >
            + add
          </button>
          <label
            className="retro-btn cursor-pointer"
            style={{
              fontSize: 14,
              padding: "12px 16px",
              borderRadius: 12
            }}
            title="Import a CSV (Gmail / LinkedIn / Google export). We extract names + emails."
          >
            ⤴ import .csv
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={onCsv}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {entries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entries.map((c, i) => (
              <span
                key={`${c.email || c.name}-${i}`}
                className="retro-panel text-xs inline-flex items-center gap-2"
                style={{
                  padding: "4px 8px",
                  borderColor: "var(--border)"
                }}
              >
                <span style={{ color: "var(--text)", fontWeight: 600 }}>
                  {c.name || "(no name)"}
                </span>
                {c.email && (
                  <span style={{ color: "var(--text-dim)" }}>{c.email}</span>
                )}
                {c.phone && !c.email && (
                  <span style={{ color: "var(--text-dim)" }}>{c.phone}</span>
                )}
                {c.profile_url && !c.email && !c.phone && (
                  <a
                    href={c.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--amber-bright)",
                      textDecoration: "underline",
                      fontSize: 11
                    }}
                  >
                    {profileLabel(c.profile_url)}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setEntries((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="retro-dim hover:text-white"
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setEntries([])}
              className="text-xs retro-dim hover:text-white"
              style={{ marginLeft: 6 }}
            >
              clear all
            </button>
          </div>
        )}

        {emails.length > 0 && entries.length === 0 && (
          <div className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>
            CSV loaded {emails.length} email{emails.length === 1 ? "" : "s"}.
            They&apos;ll be used for bulk-bcc + personalized invites below.
            <button
              type="button"
              onClick={() => setEmails([])}
              className="ml-2 retro-dim hover:text-white"
            >
              clear
            </button>
          </div>
        )}

        {csvError && (
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--red)" }}
          >
            {csvError}
          </p>
        )}

        {/* Inline generate CTA — sits directly under the entries list so
            the user's eye doesn't have to jump past the channel grid to
            the bottom of the page. Disabled until at least one entry.
            Upgraded May 2026: larger pill, gradient bg when ready, soft
            shimmer while idle so the user knows where to click. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generatePersonalized}
            disabled={
              generating || (entries.length === 0 && emails.length === 0)
            }
            style={{
              position: "relative",
              padding: "13px 22px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.005em",
              border: "none",
              color: "#fff",
              background:
                generating ||
                (entries.length === 0 && emails.length === 0)
                  ? "var(--panel-2)"
                  : "linear-gradient(135deg, #1f8bff 0%, #6b2dc9 100%)",
              cursor:
                generating ||
                (entries.length === 0 && emails.length === 0)
                  ? "not-allowed"
                  : "pointer",
              opacity:
                generating ||
                (entries.length === 0 && emails.length === 0)
                  ? 0.55
                  : 1,
              boxShadow:
                entries.length > 0 || emails.length > 0
                  ? "0 10px 28px -10px rgba(31, 139, 255, 0.55)"
                  : "none",
              transition:
                "transform 0.12s ease, box-shadow 0.18s ease, opacity 0.18s ease"
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {generating
              ? "✨ generating…"
              : entries.length === 0 && emails.length === 0
                ? "+ generate personalized invites"
                : `✨ generate ${
                    entries.length || emails.length
                  } personalized invite${
                    (entries.length || emails.length) === 1 ? "" : "s"
                  }`}
          </button>
          {entries.length === 0 && emails.length === 0 && (
            <span
              className="text-xs"
              style={{ color: "var(--text-dim)" }}
            >
              ← paste a profile URL, email, or phone above first
            </span>
          )}
        </div>
        {genError && (
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--red)" }}
          >
            {genError}
          </p>
        )}
      </div>

      {/* Personalized invite results — placed ABOVE the broadcast grid so the
          high-fidelity path is what the user sees first. Each row is a custom
          landing page generated with a twin-voice opener that references real
          context scraped from the recipient's social profile.
          UPGRADED header: bigger, gradient-eyebrow + count chip + bulk-copy
          pulled into the row so the user sees state at a glance. */}
      {(personalized.length > 0 || pendingNames.length > 0) && (
        <div
          className="mt-5"
          style={{
            padding: 20,
            borderRadius: 16,
            border: "1px solid rgba(31, 139, 255, 0.32)",
            background:
              "linear-gradient(180deg, rgba(31, 139, 255, 0.04) 0%, transparent 60%), var(--panel-solid)"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 8
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    background:
                      "linear-gradient(90deg, #1f8bff 0%, #6b2dc9 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text"
                  }}
                >
                  ready to send
                </span>
                {personalized.length > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(31, 139, 255, 0.12)",
                      color: "#1f8bff",
                      border: "1px solid rgba(31, 139, 255, 0.32)"
                    }}
                  >
                    {personalized.length} landing page
                    {personalized.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <h3
                style={{
                  margin: "6px 0 4px",
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: "-0.005em"
                }}
              >
                Your personalized invites
              </h3>
              <p
                className="text-sm"
                style={{
                  color: "var(--text-dim)",
                  margin: 0,
                  maxWidth: 620,
                  lineHeight: 1.5
                }}
              >
                Each contact has a unique URL with a twin-voice opener that
                references their profile. Click-through is dramatically
                higher than the broadcast options below.
              </p>
            </div>
            {personalized.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const all = personalized
                    .map(
                      (p) =>
                        `${p.contact.name}${p.contact.email ? " <" + p.contact.email + ">" : ""}: ${p.url}`
                    )
                    .join("\n");
                  copy(all, "all personalized links");
                }}
                className="retro-btn"
                style={{
                  fontSize: 12,
                  padding: "8px 12px",
                  borderRadius: 10,
                  flexShrink: 0
                }}
                title="Copy every personalized link as a plain-text list"
              >
                📋 copy all links
              </button>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {/* In-flight rows — render a placeholder for each contact
                still generating so the user sees instant feedback after
                pressing + add. */}
            {pendingNames.map((n) => (
              <li
                key={`pending-${n}`}
                className="retro-panel"
                style={{
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderColor: "var(--amber)"
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: "var(--amber-bright)",
                    boxShadow: "0 0 8px var(--amber-bright)",
                    animation: "sg-pulse 1.2s ease-in-out infinite"
                  }}
                />
                <div className="text-sm" style={{ color: "var(--text)" }}>
                  Generating personalized invite for{" "}
                  <span className="font-semibold">{n}</span>…
                </div>
              </li>
            ))}
            {personalized.map((p) => {
              // Initials avatar — gradient-tinted, derived from name.
              // Falls back to this if the API didn't return a scraped
              // profile photo for this contact.
              const initials = (p.contact.name || "?")
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() || "")
                .join("") || "?";
              // Scraped LinkedIn / IG / X photo from bulk-create-invites.
              // Jack: "These custom links were pulled from their LinkedIn,
              // which should be able to include the image."
              const avatarUrl = (p as any).avatar_url as string | undefined;
              return (
              <li
                key={p.slug}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--panel-solid)",
                  border: "1px solid var(--border)",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease"
                }}
              >
                {/* HEAD ROW — avatar + name + email + landing URL */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap"
                  }}
                >
                  {/* Initials always render underneath; the photo layers on
                      top. Scraped photos live on CDNs that block hotlinking
                      (media.licdn.com), so we route them through
                      /api/avatar — and if the load still fails, onError
                      hides the img and the initials show through instead of
                      a broken-image glyph. */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "relative",
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      flexShrink: 0,
                      overflow: "hidden",
                      background:
                        "linear-gradient(135deg, #1f8bff 0%, #6b2dc9 100%)",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 14,
                      letterSpacing: "0.02em",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow:
                        "0 4px 12px -4px rgba(31, 139, 255, 0.45)"
                    }}
                  >
                    {initials}
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proxiedAvatar(avatarUrl) ?? avatarUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block"
                        }}
                      />
                    ) : null}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: "var(--text)",
                        lineHeight: 1.2
                      }}
                    >
                      {p.contact.name}
                      {p.contact.email && (
                        <span
                          className="text-xs ml-2"
                          style={{
                            color: "var(--text-dim)",
                            fontWeight: 500
                          }}
                        >
                          {p.contact.email}
                        </span>
                      )}
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginTop: 3,
                        display: "inline-block",
                        fontSize: 11,
                        color: "#1f8bff",
                        wordBreak: "break-all",
                        textDecoration: "none",
                        opacity: 0.9
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.textDecoration = "underline";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.textDecoration = "none";
                      }}
                    >
                      🔗 {p.url}
                    </a>
                  </div>
                </div>

                {/* EDITABLE STARTER — the actual opener message, shown
                    in place instead of buried behind a "copy msg"
                    button. Edit it inline; the send buttons below pick
                    up the latest text. Persists to localStorage with
                    the rest of the personalized list. */}
                <div
                  className="retro-label mt-3"
                  style={{ color: "var(--text-dim)" }}
                >
                  opener · click to edit
                </div>
                <textarea
                  value={p.starter}
                  onChange={(e) => updateStarter(p.slug, e.target.value)}
                  // Auto-size to content so a short opener doesn't leave a
                  // tall blank box (Jack: "there's extra space"). The
                  // callback ref runs on mount + every edit, sizing the
                  // field to its text.
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  className="retro-input mt-1 text-sm w-full"
                  style={{
                    minHeight: 52,
                    resize: "vertical",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    fontFamily:
                      'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
                  }}
                />

                {/* SEND ROW — bigger pill buttons grouped by intent.
                    Copy-actions (neutral) on the left, channel-actions
                    (color-tinted by platform) in the middle, mark-sent
                    pulled to the right as the terminal action. */}
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => copy(p.url, "link")}
                    style={pillStyle("neutral")}
                    title="Copy just the personalized landing URL"
                  >
                    🔗 link
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      copy(`${p.starter}\n\n${p.url}`, "full message")
                    }
                    style={pillStyle("primary")}
                    title="Copy the opener + the URL as one block"
                  >
                    📋 msg + link
                  </button>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 1,
                      height: 20,
                      background: "var(--border)",
                      margin: "0 2px"
                    }}
                  />
                  <a
                    href={`sms:?&body=${encodeURIComponent(
                      `${p.starter}\n\n${p.url}`
                    )}`}
                    style={pillStyle("sms")}
                  >
                    💬 SMS
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `${p.starter}\n\n${p.url}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={pillStyle("whatsapp")}
                  >
                    🟢 WhatsApp
                  </a>
                  {p.contact.email && (
                    <a
                      href={`mailto:${p.contact.email}?subject=${encodeURIComponent(
                        "An invite from " + appUrl
                      )}&body=${encodeURIComponent(`${p.starter}\n\n${p.url}`)}`}
                      style={pillStyle("email")}
                    >
                      ✉️ Email
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => markInviteSent(p.slug)}
                    style={{
                      ...pillStyle("neutral"),
                      marginLeft: "auto",
                      opacity: 0.7
                    }}
                    title="Click to mark this invite as sent and remove it from the list"
                  >
                    ✓ mark as sent
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Channel grid — clearly framed as the LOWER-FIDELITY path now that
          the personalized invites are above. Same message broadcast to many,
          rendered in the user's twin voice rather than the platform default. */}
      <div className="mt-6 flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div
            className="retro-label"
            style={{ color: "var(--text-dim)" }}
          >
            or — broadcast the same message
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--text-dim)" }}
          >
            {voiceMode === "twin"
              ? "Drafted in your twin's voice. Same copy to everyone — fast, lower fidelity than personalized."
              : voiceMode === "loading"
              ? "Loading your twin's voice…"
              : "Generic invite copy. Add more to your twin to get a voice-customized version."}
          </div>
        </div>
        {voiceMode === "default" && (
          <button
            type="button"
            onClick={async () => {
              setVoiceMode("loading");
              try {
                const r = await fetch(
                  "/api/twin-broadcast-message?refresh=1"
                );
                const j = await r.json();
                if (j?.message) setInviteMessage(j.message);
                if (j?.tweet) setInviteTweet(j.tweet);
                setVoiceMode(j?.voice === "twin" ? "twin" : "default");
                try {
                  sessionStorage.setItem(
                    "syncedin.twinBroadcastMsg",
                    JSON.stringify(j)
                  );
                } catch {
                  /* ignore */
                }
              } catch {
                setVoiceMode("default");
              }
            }}
            className="retro-btn retro-btn-primary text-xs"
            title="Use your twin's saved voice to rewrite the generic broadcast copy"
          >
            ✨ rewrite this in my voice
          </button>
        )}
      </div>

      {/* Editable invite message — moved above the channel grid (was a
          collapsed <details> below). Users edit here once and every
          channel button picks up the change. */}
      <div className="mt-3">
        <textarea
          value={inviteMessage}
          onChange={(e) => setInviteMessage(e.target.value)}
          rows={3}
          className="retro-input text-sm"
          placeholder="Your broadcast invite copy. Edits flow into every channel below."
        />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {channels.map((c) => {
          const inner = (
            <>
              <span style={{ fontSize: 18, marginRight: 8 }}>{c.icon}</span>
              <span className="font-semibold">{c.label}</span>
            </>
          );
          if (c.href) {
            return (
              <a
                key={c.label}
                href={c.href}
                target={c.href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="retro-btn text-sm"
                style={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  padding: "12px 14px"
                }}
                title={c.note}
              >
                {inner}
              </a>
            );
          }
          return (
            <button
              key={c.label}
              type="button"
              onClick={c.onClick}
              className="retro-btn text-sm"
              style={{
                justifyContent: "flex-start",
                textAlign: "left",
                padding: "12px 14px"
              }}
              title={c.note}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {copied && (
        <div
          className="mt-3 text-xs"
          style={{ color: "var(--green)" }}
        >
          ✓ copied {copied}
        </div>
      )}

      {/* (Personalized invite results render in the panel above the broadcast
          grid — no duplicate block here.) */}

      {/* Import-help panel — shows when LinkedIn or Google Contacts CSV is clicked */}
      {importHelp && (
        <div className="mt-4 retro-panel p-4" style={{ borderColor: "var(--amber)" }}>
          <div className="flex items-start justify-between gap-3">
            <div
              className="retro-label"
              style={{ color: "var(--amber-bright)" }}
            >
              {importHelp === "linkedin"
                ? "import linkedin connections"
                : "import google contacts"}
            </div>
            <button
              type="button"
              onClick={() => setImportHelp(null)}
              className="retro-dim hover:text-white text-xs"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {importHelp === "linkedin" ? (
            <ol
              className="mt-3 text-xs space-y-1.5"
              style={{ color: "var(--text-dim)" }}
            >
              <li>
                1. Open{" "}
                <a
                  href="https://www.linkedin.com/mypreferences/d/download-my-data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--amber-bright)" }}
                >
                  LinkedIn → Settings → Get a copy of your data
                </a>
                .
              </li>
              <li>
                2. Check &quot;Connections&quot;. Request archive (usually
                ready in 10 minutes; email when done).
              </li>
              <li>
                3. Unzip → find <code>Connections.csv</code> → drop it into
                the &quot;import .csv&quot; button above.
              </li>
              <li>
                4. We pull every name + email and generate a personalized
                landing page for each.
              </li>
            </ol>
          ) : (
            <ol
              className="mt-3 text-xs space-y-1.5"
              style={{ color: "var(--text-dim)" }}
            >
              <li>
                1. Open{" "}
                <a
                  href="https://contacts.google.com/?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--amber-bright)" }}
                >
                  Google Contacts
                </a>
                .
              </li>
              <li>
                2. Top-left menu → &quot;Export&quot; → All contacts →
                &quot;Google CSV&quot;.
              </li>
              <li>
                3. Drop the downloaded <code>contacts.csv</code> into the
                &quot;import .csv&quot; button above.
              </li>
              <li>
                4. Every contact gets a personalized URL like{" "}
                <code>syncedin.org/their-name</code> with a custom opener.
              </li>
            </ol>
          )}
        </div>
      )}

      {/* QR code (free public API) */}
      {qrOpen && (
        <div
          className="mt-4 retro-panel p-4 flex items-center gap-4 flex-wrap"
        >
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
              appUrl
            )}`}
            alt="QR code for SyncedIn"
            width={180}
            height={180}
            style={{ display: "block" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="text-sm font-semibold"
              style={{ color: "var(--text)" }}
            >
              Scan to join SyncedIn
            </div>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--text-dim)" }}
            >
              Show this at a meetup, on a screen, anywhere humans are. They
              point a camera, they land on SyncedIn, they sign up.
            </p>
            <div
              className="text-xs mt-2"
              style={{
                color: "var(--text-dim)",
                wordBreak: "break-all"
              }}
            >
              {appUrl}
            </div>
          </div>
        </div>
      )}

      {/* The editable broadcast textarea lives ABOVE the channel grid
          now — see the `or — broadcast the same message` block. The
          old <details> at this position was Jack's call to retire:
          collapsing the editable copy beneath the channel buttons made
          it feel hidden, when it's actually the source of truth. */}
    </div>
  );
}

/**
 * PlatformChip — inline favicon + name pill used in the "Drop a..." intro
 * copy. Uses Google's favicon CDN so we don't have to host four logo files,
 * and the chip scales perfectly with whatever font-size it inherits.
 */
function PlatformChip({
  name,
  domain
}: {
  name: string;
  domain: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px 1px 3px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        verticalAlign: "baseline",
        lineHeight: 1.3
      }}
    >
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        width={12}
        height={12}
        style={{
          borderRadius: 2,
          display: "inline-block",
          flexShrink: 0
        }}
        loading="lazy"
      />
      <span style={{ fontWeight: 700, color: "var(--text)" }}>{name}</span>
    </span>
  );
}

/**
 * Shared pill button styling for the personalized-invite action row.
 * Variants tint the border + text so each channel reads as its own
 * brand at a glance (WhatsApp green, iMessage blue, etc.) without
 * dumping color onto buttons that don't represent a single channel.
 */
type PillVariant =
  | "neutral"
  | "primary"
  | "sms"
  | "whatsapp"
  | "email";

function pillStyle(variant: PillVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid var(--border)",
    background: "var(--panel-2)",
    color: "var(--text)",
    cursor: "pointer",
    textDecoration: "none",
    transition: "background 0.12s ease, border-color 0.12s ease",
    whiteSpace: "nowrap"
  };
  switch (variant) {
    case "primary":
      return {
        ...base,
        background: "rgba(31, 139, 255, 0.12)",
        borderColor: "rgba(31, 139, 255, 0.36)",
        color: "#1f8bff"
      };
    case "sms":
      return {
        ...base,
        background: "rgba(59, 130, 246, 0.10)",
        borderColor: "rgba(59, 130, 246, 0.32)",
        color: "#3b82f6"
      };
    case "whatsapp":
      return {
        ...base,
        background: "rgba(37, 211, 102, 0.12)",
        borderColor: "rgba(37, 211, 102, 0.36)",
        color: "#16a34a"
      };
    case "email":
      return {
        ...base,
        background: "rgba(168, 85, 247, 0.10)",
        borderColor: "rgba(168, 85, 247, 0.32)",
        color: "#a855f7"
      };
    case "neutral":
    default:
      return base;
  }
}
