"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * PushRegistrar — native-app-only push wiring. Renders nothing, does
 * nothing in the browser.
 *
 * No-spam policy extends to the permission ASK itself:
 *  - Never prompt on first launch. Only prompt on surfaces where a
 *    push would obviously matter (/messages, /conversations,
 *    /messages), and only ONCE ever.
 *  - If permission is already granted, register silently anywhere.
 *
 * Tapping a push deep-links to the conversation via the `url` field in
 * the payload.
 */

const ASKED_KEY = "syncedin-push-asked";
let wiredThisSession = false;

export function PushRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    if (wiredThisSession) return;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );

        const perm = await PushNotifications.checkPermissions();
        let status = perm.receive;

        if (status !== "granted") {
          const valueSurface = /^\/(messages|conversations)/.test(
            pathname || ""
          );
          if (!valueSurface) return;
          try {
            if (localStorage.getItem(ASKED_KEY)) return;
            localStorage.setItem(ASKED_KEY, "1");
          } catch {
            /* storage blocked: still allow one ask this session */
          }
          status = (await PushNotifications.requestPermissions()).receive;
        }
        if (status !== "granted") return;

        wiredThisSession = true;
        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener("registration", (t) => {
          fetch("/api/push/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token: t.value,
              platform: Capacitor.getPlatform()
            })
          }).catch(() => {});
        });

        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const url = (action.notification?.data as { url?: string })?.url;
            if (
              typeof url === "string" &&
              url.startsWith("https://syncedin.org")
            ) {
              window.location.href = url;
            }
          }
        );

        await PushNotifications.register();
      } catch {
        /* web bundle or plugin unavailable: ignore entirely */
      }
    })();
  }, [pathname]);

  return null;
}
