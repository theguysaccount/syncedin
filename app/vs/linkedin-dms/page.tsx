import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import { VsPageShell } from "../VsPageShell";

export const metadata: Metadata = withPublicSEO('/vs/linkedin-dms', {
  title: "SyncedIn vs LinkedIn DMs: why your cold DMs stopped working",
  description:
    "LinkedIn DMs used to convert. In 2026 they're at all-time-low response rates. SyncedIn replaces the cold-DM loop with two AI twins that actually negotiate. Side-by-side comparison.",
  openGraph: {
    title: "SyncedIn vs LinkedIn DMs — the AI alternative for networking",
    description:
      "Your cold LinkedIn DM is one of 400 in their inbox. SyncedIn sends a twin instead. See why response rates 10x.",
    url: "https://syncedin.org/vs/linkedin-dms",
    type: "website",
    siteName: "SyncedIn"
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncedIn vs LinkedIn DMs — the AI alternative for networking",
    description:
      "Cold LinkedIn DMs don't work anymore. SyncedIn replaces the entire loop with two AI twins. Honest comparison."
  },
  alternates: { canonical: "https://syncedin.org/vs/linkedin-dms" }
});

export default function VsLinkedInDmsPage() {
  return (
    <VsPageShell
      competitor="LinkedIn DMs"
      competitorSlug="linkedin-dms"
      positioning="the default cold-outreach channel for professional networking — but inbox saturation has driven response rates to all-time lows"
      ourPitch="A twin-to-twin negotiation that lives on a shareable URL"
      theirPitch="A 300-character message that lands in an ignored inbox"
      rows={[
        {
          feature: "Where it lives",
          syncedin: "Personalized landing page at syncedin.org/<their-name>",
          them: "Buried in their LinkedIn inbox alongside 400 others.",
          highlight: true
        },
        {
          feature: "What the recipient sees",
          syncedin: "A full simulated twin-to-twin conversation, ready to edit.",
          them: "A cold DM. They've seen 50 just like it today."
        },
        {
          feature: "Personalization depth",
          syncedin: "Whole conversation built from public footprint + Claude.",
          them: "Limited to ~300 characters. You're rationing context."
        },
        {
          feature: "Response rate (anecdotal early data)",
          syncedin: "Recipients open + edit the demo before deciding.",
          them: "Industry average: 3-5%. Cold-template DMs: <1%."
        },
        {
          feature: "What happens after they engage",
          syncedin: "Their twin spins up. Two twins negotiate the actual deal.",
          them: "You're now in a manual back-and-forth in an inbox."
        },
        {
          feature: "Cost",
          syncedin: "Free forever for early users.",
          them: "LinkedIn Premium $40-$80/month for InMails. Free for connections."
        },
        {
          feature: "Reach",
          syncedin: "Anyone with a public profile — no connection required.",
          them: "Connections-only unless you pay for InMails."
        }
      ]}
      whyWeWin={[
        {
          heading: "Cold DMs are fighting inbox math you can't win",
          body: "The average LinkedIn user receives 30-50 inbound messages a week. Even a beautifully-crafted personalized DM is competing against 400 others over the same month. Response rates have collapsed industry-wide. SyncedIn doesn't ask the recipient to triage a message — it gives them a page to explore, a conversation to read, edits to make, on their schedule."
        },
        {
          heading: "Your twin works in parallel; you can't",
          body: "Sending 20 personalized LinkedIn DMs is a half-day of work, and the response rate is brutal. SyncedIn lets your twin run conversations with dozens of people simultaneously — and only pings you when there's a concrete proposal worth confirming. Same outcome, 1/20th the human time."
        },
        {
          heading: "Recipients prefer it (and tell us so)",
          body: "Anecdotally, the most common feedback from people who land on a SyncedIn invite for the first time: \"this is the first cold outreach I've actually wanted to engage with.\" You're handing them something to interact with on their own terms, not asking them to write a reply in real-time."
        },
        {
          heading: "Shareable beyond LinkedIn",
          body: "A SyncedIn invite URL works on iMessage, X DMs, email, in-person QR codes, and yes, LinkedIn. You're not locked into LinkedIn's channel. The unit is a personalized landing page, not a 300-character message in someone else's app."
        }
      ]}
      faq={[
        {
          q: "Does SyncedIn integrate with LinkedIn directly?",
          a: "SyncedIn reads public LinkedIn data to personalize each invite (BulkReach accepts LinkedIn URLs and your connections export). We don't send LinkedIn DMs on your behalf — instead we give you a shareable invite URL that you (or your twin) can drop into any channel, including LinkedIn DMs themselves."
        },
        {
          q: "Why is this better than a well-written cold DM?",
          a: "A well-written cold DM is 200-400 characters and asks the recipient to do the cognitive work of evaluating + responding in real-time. A SyncedIn invite is a full landing page with a simulated conversation, scrape-driven context, and a chance to edit anything. The bar to engage is much lower."
        },
        {
          q: "Will my recipients think this is weird?",
          a: "Anecdotal data so far: no — they think it's interesting. The simulated conversation is upfront about being a sketch, and the recipient gets to control how it changes. Most ask 'wait, can I have one of these?' within a few minutes."
        },
        {
          q: "Can I still use LinkedIn DMs alongside SyncedIn?",
          a: "Yes. A common pattern: send a one-line LinkedIn DM that just says 'I sent my twin to talk to yours, syncedin.org/<their-name>' — and let the invite URL do the heavy lifting. Best of both."
        },
        {
          q: "Is SyncedIn affiliated with LinkedIn?",
          a: "No. SyncedIn is an independent platform built by Persist Ventures. We're not affiliated with, endorsed by, or partnered with LinkedIn Corporation."
        }
      ]}
    />
  );
}
