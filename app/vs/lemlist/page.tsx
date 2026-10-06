import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import { VsPageShell } from "../VsPageShell";

export const metadata: Metadata = withPublicSEO('/vs/lemlist', {
  title: "SyncedIn vs Lemlist: an AI alternative for cold outreach in 2026",
  description:
    "Lemlist personalizes the sender's cold email. SyncedIn skips the cold email entirely — two AI twins negotiate, and you only see the deal worth taking. The honest comparison.",
  openGraph: {
    title: "SyncedIn vs Lemlist — the AI alternative for cold outreach",
    description:
      "Lemlist makes you write better cold emails, faster. SyncedIn skips cold email entirely. See the honest side-by-side comparison.",
    url: "https://syncedin.org/vs/lemlist",
    type: "website",
    siteName: "SyncedIn"
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncedIn vs Lemlist — the AI alternative for cold outreach",
    description:
      "Two AI twins negotiate before two humans meet. The Lemlist alternative for people who'd rather not write the cold email at all."
  },
  alternates: { canonical: "https://syncedin.org/vs/lemlist" }
});

export default function VsLemlistPage() {
  return (
    <VsPageShell
      competitor="Lemlist"
      competitorSlug="lemlist"
      positioning="the sender-side cold-email personalization tool — it helps you write better outbound messages, faster"
      ourPitch="A networking agent for both sides"
      theirPitch="A faster cold-email composer for the sender"
      rows={[
        {
          feature: "Who the AI works for",
          syncedin: "Both sender AND recipient. Both get a twin.",
          them: "Just the sender. The recipient still has to read.",
          highlight: true
        },
        {
          feature: "What gets sent",
          syncedin: "A simulated negotiation, ready to edit, no cold-email energy.",
          them: "A personalized cold email. Better than generic, still cold."
        },
        {
          feature: "Recipient experience",
          syncedin: "Opens a live demo conversation. Edits anything, no signup.",
          them: "Inbox-fatigued. Same cold-DM friction, slightly warmer copy."
        },
        {
          feature: "Personalization source",
          syncedin: "LinkedIn + X + public web + the recipient's own edits.",
          them: "Mostly LinkedIn + custom variables you set up."
        },
        {
          feature: "Time to value",
          syncedin: "Two minutes to onboard, twin runs in parallel forever.",
          them: "Hours to set up sequences, ongoing manual list-building."
        },
        {
          feature: "Pricing",
          syncedin: "Free forever for early users.",
          them: "$59-$159/seat/month depending on plan."
        },
        {
          feature: "Best for",
          syncedin: "Founders, operators, and anyone with networking-as-a-bottleneck.",
          them: "Sales teams running outbound at high volume."
        }
      ]}
      whyWeWin={[
        {
          heading: "The recipient's time is the constraint, not the sender's",
          body: "Lemlist and every other sender-side tool optimizes the wrong variable. Making cold emails 20% better doesn't change inbox saturation. SyncedIn gives the recipient an AI too — so the value-discovery part of networking happens between two agents in seconds, not between two humans across weeks."
        },
        {
          heading: "Negotiation, not outreach",
          body: "A Lemlist campaign sends N personalized messages and prays. A SyncedIn twin starts an actual back-and-forth: it identifies mission alignment, proposes a concrete final destination (an intro, a hire, a check, a partnership), and only pings the human when there's something worth confirming."
        },
        {
          heading: "Edits feed the model — yours and the recipient's",
          body: "Every time you (or the person you're reaching out to) edits a simulated reply, that edit becomes training signal for both twins. Lemlist's personalization is static — you template once and ship. SyncedIn's twins get more accurate at sounding like you the longer they're running."
        },
        {
          heading: "Free, not $159/seat/month",
          body: "Lemlist is positioned for sales teams with budget. SyncedIn is free forever for early users — because the asymmetric value of getting twins in front of people NOW outweighs near-term revenue. If you're a founder or operator paying out of pocket, this matters."
        }
      ]}
      faq={[
        {
          q: "Is SyncedIn a Lemlist replacement for sales teams?",
          a: "It can be, but the framing is different. Lemlist is built for high-volume outbound sales sequences. SyncedIn is built for high-leverage one-to-one networking. If you're sending 500 cold emails a day, Lemlist's sequencing is still better. If you're trying to land 5 critical intros a month, SyncedIn's twin-to-twin model wins."
        },
        {
          q: "Can I import my Lemlist contact lists into SyncedIn?",
          a: "Yes — SyncedIn's BulkReach toolkit accepts the same kinds of contact CSVs Lemlist exports (name, email, LinkedIn URL). Each contact becomes a personalized invite landing page rather than a cold email blast."
        },
        {
          q: "Does SyncedIn send emails like Lemlist does?",
          a: "Not by default. SyncedIn generates an invite landing page per recipient at syncedin.org/<their-name>. You share that URL however you'd like — DM, email, text, in-person QR. The recipient opens a simulated twin-to-twin conversation, not an inbox."
        },
        {
          q: "How is the personalization different?",
          a: "Lemlist personalizes via custom variables you define ({{firstName}}, {{company}}, etc.). SyncedIn scrapes the recipient's public footprint (LinkedIn, X, web) and Claude composes the entire opening message from scratch — different angle for every recipient, never a templated mail-merge."
        },
        {
          q: "Why is SyncedIn free if Lemlist isn't?",
          a: "We're in launch mode and want twins in front of people NOW. Early users are free forever. We'll monetize on the workflow surfaces (premium connectors, advanced agents, team workspaces) once distribution is locked in. Lemlist is a mature SaaS — different stage, different model."
        }
      ]}
    />
  );
}
