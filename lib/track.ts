import { funnelCollectionAllowed, sanitizeFunnelEvent, validFunnelId } from "@/lib/funnel-events";

/**
 * Fire-and-forget funnel beacon. Never throws, never blocks UI. Uses
 * sendBeacon when available so events survive page navigations (claim
 * clicks that leave the page). The anonymous id is a random
 * localStorage token so a funnel can be stitched across steps without
 * an account. It is pseudonymous analytics, not anonymous proof.
 * Only reviewed categories and bounded counts leave this helper.
 */
export function track(event: string, meta?: Record<string, unknown>) {
  try {
    if (typeof window === "undefined") return;
    if (!funnelCollectionAllowed(window.location.href, {
      doNotTrack: navigator.doNotTrack,
      globalPrivacyControl: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl,
      automated: navigator.webdriver
    })) return;
    const safe = sanitizeFunnelEvent({ event, path: window.location.pathname, meta });
    if (!safe) return;
    let anon = "";
    try {
      anon = localStorage.getItem("syncedin-anon-id") || "";
      if (!validFunnelId(anon)) {
        anon = crypto.randomUUID();
        localStorage.setItem("syncedin-anon-id", anon);
      }
    } catch {
      /* storage blocked: events still send, just unstitched */
    }
    const payload = JSON.stringify({
      event: safe.event,
      path: safe.path,
      anon: validFunnelId(anon) ? anon : "",
      meta: safe.meta
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([payload], { type: "application/json" })
      );
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  } catch {
    /* never break the product for analytics */
  }
}
