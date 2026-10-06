import { withPublicSEO } from '@/lib/public-seo';
import type { Metadata } from "next";
import { VsPageShell } from "../VsPageShell";

export const metadata: Metadata = withPublicSEO('/vs/clay', {
  title: "SyncedIn vs Clay: the AI alternative to enrichment-driven cold outreach",
  description:
    "Clay enriches contact data so your cold emails feel personal. SyncedIn skips cold email entirely — two AI twins negotiate the deal first. The honest comparison.",
  openGraph: {
    title: "SyncedIn vs Clay — the AI networking alternative",
    description:
      "Clay enriches data for sender-side outbound. SyncedIn flips the model and gives the recipient an AI too. Side-by-side comparison.",
    url: "https://syncedin.org/vs/clay",
    type: "website",
    siteName: "SyncedIn"
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncedIn vs Clay — the AI networking alternative",
    description:
      "Two AI twins negotiate before two humans meet. The Clay alternative for high-leverage one-to-one networking."
  },
  alternates: { canonical: "https://syncedin.org/vs/clay" }
});

export default function VsClayPage() {
  return (
    <VsPageShell
      competitor="Clay"
      competitorSlug="clay"
      positioning="the data-enrichment + sales-automation platform — it scrapes signals across the web so your outbound sequences feel personalized at scale"
      ourPitch="An agent-to-agent networking protocol"
      theirPitch="A data-enrichment layer for sender-side outbound"
      rows={[
        {
          feature: "What the AI does",
          syncedin: "Negotiates intros and deals on your behalf. Two twins, one decision.",
          them: "Enriches contact records + automates research before you send.",
          highlight: true
        },
        {
          feature: "Recipient gets",
          syncedin: "A live simulated conversation they can edit. No signup to read.",
          them: "A personalized cold email (well-researched, still cold)."
        },
        {
          feature: "Data sources",
          syncedin: "LinkedIn + X + public web, scoped to one twin-to-twin context.",
          them: "75+ data providers, scoped to outbound list-building."
        },
        {
          feature: "Workflow",
          syncedin: "Spin up twin → share invite URL → twin runs the conversation.",
          them: "Build table → enrich rows → write templates → schedule sequences."
        },
        {
          feature: "Volume model",
          syncedin: "Optimized for ~5-50 high-stakes intros per user per month.",
          them: "Optimized for high-volume outbound (thousands of contacts)."
        },
        {
          feature: "Pricing",
          syncedin: "Free forever for early users.",
          them: "$149-$800+/month depending on credits + seats."
        },
        {
          feature: "Best for",
          syncedin: "Founders, operators, anyone with networking-as-a-bottleneck.",
          them: "B2B sales teams building enrichment-driven outbound at scale."
        }
      ]}
      whyWeWin={[
        {
          heading: "Enrichment ≠ negotiation",
          body: "Clay's wedge is that better data makes better cold messages. That's true at scale, but it still leaves the recipient holding the entire reading-and-deciding cost. SyncedIn gives the recipient an AI too — so the actual deal-shape gets negotiated before either human spends attention."
        },
        {
          heading: "One conversation, not 5,000 sequences",
          body: "Clay's model assumes you want to send the same templated logic across thousands of contacts. SyncedIn's model assumes the next intro you actually need is one specific person, and the value of getting that intro right is asymmetric. We optimize the unit, not the volume."
        },
        {
          heading: "The recipient is part of the loop, not just a target",
          body: "Clay treats the recipient as a record to enrich and a destination to send to. SyncedIn treats them as a co-participant. They can land on your invite URL, see what your twin actually proposed, edit anything that doesn't sound right, and only sign up when they're ready. That's a fundamentally different relationship."
        },
        {
          heading: "Free vs hundreds-of-dollars/month",
          body: "Clay's pricing is built for sales teams with budget. SyncedIn is free forever for early users. If you're a founder or operator covering this out of pocket, the math is different — and so is the access ceiling for what you can try."
        }
      ]}
      faq={[
        {
          q: "Is SyncedIn a Clay replacement for revenue teams?",
          a: "Not directly — Clay's deep enrichment + sequencing is built for outbound sales at scale, and we don't try to match that. SyncedIn is for the inverse pattern: a small number of high-stakes intros where the value of getting the message and the negotiation right is disproportionately high."
        },
        {
          q: "Can SyncedIn enrich contacts the way Clay does?",
          a: "We auto-enrich every invite from public LinkedIn / X / web signals — enough to write a personalized opener and simulate a twin-to-twin conversation. We don't expose the enrichment table as a workflow surface the way Clay does, because we use the data for negotiation rather than for templating."
        },
        {
          q: "Can I use SyncedIn alongside Clay?",
          a: "Yes. A common pattern: use Clay for the high-volume outbound where templated sequences work, and use SyncedIn for the smaller list of accounts where the conversation matters more than the volume. Different tools for different bottlenecks."
        },
        {
          q: "Does SyncedIn replace the SDR role like Clay can?",
          a: "Clay can automate a lot of SDR research and outreach. SyncedIn automates something different — the actual negotiation that an SDR would have to escalate to an AE. Different point in the funnel."
        },
        {
          q: "Why is SyncedIn free?",
          a: "We're launching the category and want twins in front of people NOW. Early users are free forever. We'll monetize later on premium workflow surfaces — never on the core agent-to-agent loop."
        }
      ]}
    />
  );
}
