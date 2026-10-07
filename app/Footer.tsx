"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUILD_SHA } from "@/lib/version";

// Routes where the footer creates an awkward dead band — chat surfaces
// where the user's expectation is "this fills the viewport, not a
// scrollable marketing column with a footer band at the bottom". On
// these routes the footer renders nothing. Everywhere else (landing,
// dashboard, invite pages) it shows as before.
const HIDE_ON: Array<string | RegExp> = [
  /^\/(?:login|dashboard|invite|onboarding|settings|personal-intelligence|poll|ghosts|continuation)(?:\/|$)/,
  /^\/conversations(?:\/|$)/,
  /^\/messages(?:\/|$)/,
  /^\/admin(?:\/|$)/,
  // Akash beta feedback: tapping the /talk composer surfaced the footer
  // (build SHA, marketing links) — wrong surface for a chat experience.
  /^\/talk(?:\/|$)/,
  /^\/twin(?:\/|$)/,
  /^\/chat(?:\/|$)/
];

function shouldHide(path: string): boolean {
  return HIDE_ON.some((p) =>
    typeof p === "string" ? path === p : p.test(path)
  );
}

export function Footer() {
  const path = usePathname() || "";
  if (shouldHide(path)) return null;
  return (
    <footer
      // mt-16 → mt-8 cuts the cavernous gap users were seeing on shorter
      // pages. mb-8 stays — keeps the footer from clinging to the
      // viewport bottom.
      className="max-w-6xl mx-auto px-5 mt-8 mb-8 pt-6 text-xs flex flex-wrap items-center justify-between gap-3"
      style={{
        color: "var(--text-dim)",
        borderTop: "1px solid var(--border)"
      }}
    >
      {/*
        SyncedIn copyright shown to users. The build SHA stays in the DOM
        as a hidden comment so I can still inspect it (Akash beta
        feedback: "build a5fe759" looked like a leak / unfinished surface
        to a new user, even though I use it constantly for diagnosis).
      */}
      <div className="font-mono">
        SyncedIn{" "}
        <span style={{ color: "var(--amber-bright)" }}>
          {new Date().getFullYear()}
        </span>
        {/* build:{BUILD_SHA} */}
        <span style={{ display: "none" }}>build:{BUILD_SHA}</span>
      </div>
      <nav className="flex items-center gap-4">
        <Link href="/wins" className="hover:text-white">
          Wins
        </Link>
        <Link href="/hypernetwork" className="hover:text-white">
          Hypernetwork
        </Link>
        <Link href="/feedback" className="hover:text-white">
          Feedback
        </Link>
        <Link href="/privacy" className="hover:text-white">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-white">
          Terms
        </Link>
        <Link href="/support" className="hover:text-white">
          Support
        </Link>
        <a
          href="mailto:jacksonjezio@gmail.com"
          className="hover:text-white"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
