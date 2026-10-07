import { redirect } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";
import { TwinChatUI } from "./TwinChatUI";
import { PendingProposalsRail } from "./PendingProposalsRail";
import { pickBestFirstMatch } from "@/lib/matchmaking";

/**
 * Talk to your own twin (#159). A 1:1 chat surface where the user can
 * triage pending proposals, refine the twin's voice, or just think out
 * loud. The twin pulls live context from the user's twin_profiles row
 * + their pending proposals on every send.
 */
export const dynamic = "force-dynamic";

export default async function TwinPage({
  searchParams
}: {
  searchParams?: { welcome?: string };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/twin");

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const selfName =
    ((profile as any)?.display_name as string) ||
    ((profile as any)?.email as string)?.split("@")[0] ||
    "you";

  // First-arrival welcome — the twin greets the user, orients them, and
  // names the best match it found. We compute the match server-side so the
  // greeting can be specific. Best-effort; greeting still fires without it.
  const isWelcome = (searchParams?.welcome ?? "") === "1";
  let welcomeMatch: string | null = null;
  if (isWelcome) {
    try {
      const m = await pickBestFirstMatch(user.id);
      if ((m as any)?.counterpartId) {
        const { data: cp } = await service
          .from("profiles")
          .select("display_name, handle")
          .eq("id", (m as any).counterpartId)
          .maybeSingle();
        welcomeMatch =
          ((cp as any)?.display_name as string) ||
          ((cp as any)?.handle as string) ||
          null;
      }
    } catch {
      /* greeting falls back to a generic match offer */
    }
  }

  return (
    <AppShell>
      {/* Compact header — Jack: "shorten that so it's only a single line,
          remove the blue top chat, give me the maximal amount of view."
          Dropped the eyebrow label + collapsed the 2-line blurb to one
          line + shrank the h1 so the chat scroller reclaims the vertical
          space (the scroller's height reservation in TwinChatUI was cut
          to match). */}
      <section className="mt-1">
        <header className="page-heading"><div><h1>Your twin</h1><p>Private workspace</p></div><Link href="/onboarding" className="retro-btn"><SlidersHorizontal size={16} aria-hidden="true" />Edit context</Link></header>

        {/* Desktop: 2-col grid — chat fills the wide center, pending
            proposals live in a sticky right rail with Accept/Deny
            buttons so the user can move on real action without leaving
            this page. Mobile: stacks (chat first, proposals below). */}
        <div
          className="mt-3 grid gap-6 twin-grid"
          style={{
            gridTemplateColumns: "minmax(0, 1fr)"
          }}
        >
          <div style={{ minWidth: 0 }}>
            <TwinChatUI
              selfName={selfName}
              welcome={isWelcome}
              welcomeMatch={welcomeMatch}
            />
          </div>
          <div className="twin-rail" style={{ minWidth: 0 }}>
            <PendingProposalsRail />
          </div>
        </div>

        <style>{`
          /* Drop breakpoint from 1024 → 900 so the right rail engages
             on 13" laptops + smaller windows. Jack: "the whole right
             side is empty — use that space." Below 900px the rail
             stacks below the chat (mobile flow). */
          @media (min-width: 900px) {
            .twin-grid {
              grid-template-columns: minmax(0, 1fr) 300px !important;
            }
          }
          @media (max-width: 899px) {
            .twin-rail { display: none; }
          }
          /* Composer is position:fixed at viewport bottom — pad the
             chat column bottom so the last bubble + the chip strip
             don't sit underneath the composer. */
          .twin-grid > div:first-child {
            padding-bottom: 0;
          }
        `}</style>
      </section>
    </AppShell>
  );
}
