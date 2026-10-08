"use client";

import { useEffect } from "react";

/**
 * Global auto-reporter. Listens for `window.error` + `unhandledrejection`,
 * dedupes, throttles, and POSTs each to `/api/error-report`. Mounted
 * once at the root in app/layout.tsx so every page is covered.
 *
 * Distinct from ChunkErrorRecovery (which handles stale-chunk reloads
 * specifically). This one captures the REST — server-action 500s,
 * Supabase RLS failures, unhandled fetches, React effect throws. Goal
 * per Jack: humans never encounter raw errors without us knowing.
 *
 * Privacy: the captured payload includes URL + user-agent + first 4KB
 * of stack + (server-side) the authed user's id/email if signed in.
 * No DOM content, no localStorage, no form values.
 */
export function ErrorAutoReport() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dedupe: same message+source combo within 30s only reports once.
    // Keeps a renderloop-style error from flooding the feedback table.
    const seen = new Map<string, number>();
    const DEDUPE_MS = 30_000;

    function shouldReport(key: string): boolean {
      const now = Date.now();
      const last = seen.get(key) || 0;
      if (now - last < DEDUPE_MS) return false;
      seen.set(key, now);
      // Trim the map so it can't grow unboundedly in long sessions.
      // Use Array.from (not spread) — TS target is ES5 so iterator
      // spread isn't legal without --downlevelIteration.
      if (seen.size > 60) {
        const entries = Array.from(seen.entries());
        entries.sort((a, b) => a[1] - b[1]);
        const oldest = entries[0];
        if (oldest) seen.delete(oldest[0]);
      }
      return true;
    }

    function report(payload: {
      message: string;
      stack?: string;
      source?: string;
      extras?: Record<string, unknown>;
    }) {
      const key = `${payload.message}::${payload.source ?? ""}`;
      if (!shouldReport(key)) return;
      // Skip noise we can't act on.
      const m = payload.message.toLowerCase();
      if (
        m.includes("resizeobserver loop") ||
        m.includes("script error") || // cross-origin script with no detail
        m.includes("non-error promise rejection captured")
      ) {
        return;
      }
      const body = {
        message: payload.message,
        stack: payload.stack,
        source: payload.source,
        url: window.location.pathname.startsWith("/agent/") ? window.location.origin + window.location.pathname : window.location.href,
        user_agent: navigator.userAgent,
        extras: payload.extras
      };
      // Use keepalive + sendBeacon-equivalent so the report survives
      // page-unload races. Fall back to fetch keepalive.
      try {
        const data = JSON.stringify(body);
        const blob = new Blob([data], { type: "application/json" });
        const sent =
          typeof navigator.sendBeacon === "function"
            ? navigator.sendBeacon("/api/error-report", blob)
            : false;
        if (!sent) {
          void fetch("/api/error-report", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: data,
            keepalive: true
          }).catch(() => {});
        }
      } catch {
        /* never throw from the error reporter itself */
      }
    }

    function onError(event: ErrorEvent) {
      // ChunkLoadError is handled separately by ChunkErrorRecovery —
      // skip here so we don't double-report.
      const msg = event.message || (event.error && (event.error as any).message) || "";
      if (/ChunkLoadError|Loading chunk/.test(msg)) return;
      report({
        message: msg || "unknown_window_error",
        stack: event.error && (event.error as any).stack,
        source: event.filename
          ? `${event.filename}:${event.lineno ?? 0}`
          : "window.error"
      });
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason: any = event.reason;
      const msg =
        (reason && (reason.message || reason.toString())) ||
        "unhandled_promise";
      if (/ChunkLoadError|Loading chunk/.test(msg)) return;
      report({
        message: msg.slice(0, 1000),
        stack: reason && reason.stack ? String(reason.stack) : undefined,
        source: "unhandledrejection"
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

/**
 * Manual report helper — call from explicit catch blocks to report a
 * caught error that wouldn't otherwise reach `window.error`. Same
 * payload shape as the global listener.
 */
export function reportClientError(payload: {
  message: string;
  stack?: string;
  source?: string;
  extras?: Record<string, unknown>;
}): void {
  if (typeof window === "undefined") return;
  try {
    const body = {
      ...payload,
      url: window.location.pathname.startsWith("/agent/") ? window.location.origin + window.location.pathname : window.location.href,
      user_agent: navigator.userAgent
    };
    const data = JSON.stringify(body);
    const blob = new Blob([data], { type: "application/json" });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/error-report", blob);
      return;
    }
    void fetch("/api/error-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: data,
      keepalive: true
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}
