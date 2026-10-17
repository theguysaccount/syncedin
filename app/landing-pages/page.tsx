import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";

/**
 * /landing-pages — directory of every custom landing surface we've
 * shipped, so Jack can find them all in one place.
 *
 * Jack: "I think we made a page, a landing page just for onboarding
 * co-founders. I know we've made different custom landing pages.
 * Maybe it would be good to have a page of these pages somewhere
 * that I can find easier."
 *
 * Each card carries: title, audience, URL, one-line purpose, and a
 * copy-link button. Grouped by category. Static list — these pages
 * are explicit routes in the codebase, not data-driven, so editing
 * this file is the source of truth.
 *
 * Lives in AppShell so the nav + clone-sync card render. Authed-only
 * (most users don't need to discover these; this is an admin/operator
 * surface).
 */
export const dynamic = "force-dynamic";

type LP = {
  title: string;
  url: string;
  audience: string;
  purpose: string;
  status: "live" | "draft" | "private";
};

type Group = {
  label: string;
  items: LP[];
};

const GROUPS: Group[] = [
  {
    label: "Public marketing",
    items: [
      {
        title: "Home",
        url: "/",
        audience: "Everyone",
        purpose: "Handle-picker hero. Default conversion surface.",
        status: "live"
      },
      {
        title: "LinkedIn alternative",
        url: "/alternatives/linkedin",
        audience: "Warm searchers comparing tools",
        purpose:
          "Head-to-head 8-facet comparison with LinkedIn + Article/ItemList JSON-LD for AI-search citation.",
        status: "live"
      },
      {
        title: "FAQ",
        url: "/faq",
        audience: "Curious visitors with specific questions",
        purpose:
          "12 Q&A with FAQPage JSON-LD schema so Google's People Also Ask carousel picks up answers.",
        status: "live"
      }
    ]
  },
  {
    label: "Vertical / persona landings",
    items: [
      {
        title: "Founders ↔ Cofounders",
        url: "/vertical/cofounders",
        audience: "Founders looking for cofounder fit",
        purpose:
          "Goal-aware funnel — captures cofounder search criteria during onboarding.",
        status: "live"
      },
      {
        title: "Founders ↔ VCs",
        url: "/vertical/vcs",
        audience: "Founders raising",
        purpose:
          "Funnel for matching founders with investors — different first-questions than cofounder path.",
        status: "live"
      },
      {
        title: "Founders ↔ Advisors",
        url: "/vertical/advisors",
        audience: "Founders seeking advisory relationships",
        purpose:
          "Funnel framed around equity-light advisor matching.",
        status: "live"
      },
      {
        title: "Founders ↔ Idea collaborators",
        url: "/vertical/idea-with",
        audience: "Builders shopping a vague concept",
        purpose:
          "Pre-cofounder funnel — pairs around the idea, not the founding commitment.",
        status: "live"
      },
      {
        title: "Careers",
        url: "/careers",
        audience: "People who want to work on SyncedIn",
        purpose:
          "Roles + Calendly book-a-call CTA. Lives outside the standard funnel.",
        status: "live"
      }
    ]
  },
  {
    label: "Partner / integration landings",
    items: [
      {
        title: "Link.me creators",
        url: "/for/linkme",
        audience: "Link.me creators (public)",
        purpose:
          "Paste your Link.me URL → we scrape your existing profile and stand up a twin from it. Drop-in upgrade for any link-in-bio user.",
        status: "live"
      },
      {
        title: "Link.me × SyncedIn partnership demo",
        url: "/partners/linkme",
        audience: "Link.me founder pitch (private, noindex)",
        purpose:
          "Shows SyncedIn features living natively inside Link.me's UI — sales tool for the partnership conversation.",
        status: "private"
      }
    ]
  },
  {
    label: "Conversational + AI surfaces",
    items: [
      {
        title: "Chat with your twin",
        url: "/twin",
        audience: "Authed users — the home base",
        purpose:
          "Streaming chat with your own AI clone. Ask it who to reach out to, draft messages, triage proposals.",
        status: "live"
      },
      {
        title: "Talk with ghosts",
        url: "/ghosts",
        audience: "Authed users exploring matches",
        purpose:
          "Paste anyone's profile, watch a conversation play out with their 'ghost' twin modeled from public data.",
        status: "live"
      },
      {
        title: "Import a chat (continuation)",
        url: "/continuation",
        audience: "Authed users with existing relationships",
        purpose:
          "Upload an iMessage / WhatsApp / Telegram export. We model both sides + generate the next 8-10 messages.",
        status: "live"
      }
    ]
  },
  {
    label: "Community + event landings",
    items: [
      {
        title: "Sync a community",
        url: "/communities/new",
        audience: "Community organizers",
        purpose:
          "Spin up a private community link. Each member gets a twin, twins talk in parallel, density compounds.",
        status: "live"
      },
      {
        title: "Sync a conference",
        url: "/conferences/new",
        audience: "Event hosts",
        purpose:
          "Same as communities but framed for one-time events. Attendees walk in with a ranked shortlist.",
        status: "live"
      }
    ]
  },
  {
    label: "Personalized invite landings",
    items: [
      {
        title: "/[slug] invite landing (per recipient)",
        url: "/invite",
        audience: "Each invited person — fully personalized",
        purpose:
          "Real-faces strip + auto-generated demo conversation modeling the actual scraped recipient. Auth-gated only on the real deal.",
        status: "live"
      },
      {
        title: "/dm/[handle] paid creator DM",
        url: "/dm",
        audience: "Creators monetizing inbound",
        purpose:
          "Public DM surface with optional paid boost via Stripe Connect 80/20. Anonymous visitor → twin → creator triage.",
        status: "live"
      }
    ]
  }
];

export default async function LandingPagesIndex() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/landing-pages");

  return (
    <AppShell>
      <section className="mt-2">
        <div className="retro-label">landing pages</div>
        <h1 className="retro-h1 text-2xl sm:text-3xl mt-2 leading-tight">
          Every custom landing we've shipped.
        </h1>
        <p
          className="mt-2 text-sm sm:text-base"
          style={{ color: "var(--text-dim)" }}
        >
          One source of truth so you can find, share, or audit any
          landing surface without grep'ing the codebase. Click a card
          to open it in a new tab.
        </p>

        <div className="mt-6 space-y-8">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--amber-bright)",
                  marginBottom: 8
                }}
              >
                {g.label}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12
                }}
              >
                {g.items.map((it) => (
                  <Link
                    key={it.url}
                    href={it.url}
                    target="_blank"
                    className="retro-panel retro-panel-hover"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: 14,
                      textDecoration: "none",
                      color: "inherit"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {it.title}
                      </div>
                      {it.status === "private" && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#b91c1c",
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: "rgba(239, 68, 68, 0.08)",
                            border: "1px solid rgba(239, 68, 68, 0.25)"
                          }}
                        >
                          private
                        </span>
                      )}
                    </div>
                    <div
                      className="retro-dim"
                      style={{
                        fontSize: 11,
                        fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
                      }}
                    >
                      syncedin.org{it.url}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text)"
                      }}
                    >
                      {it.audience}
                    </div>
                    <div
                      className="retro-dim"
                      style={{ fontSize: 12, lineHeight: 1.45 }}
                    >
                      {it.purpose}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p
          className="retro-dim mt-8 text-xs"
          style={{ lineHeight: 1.5 }}
        >
          Need a new landing? They're all just <code>app/&lt;route&gt;/page.tsx</code>{" "}
          files. Add the new one + register it in the GROUPS array of{" "}
          <code>app/landing-pages/page.tsx</code>.
        </p>
      </section>
    </AppShell>
  );
}
