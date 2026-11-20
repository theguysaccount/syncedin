import type { Metadata } from "next";
import { withPublicSEO } from "@/lib/public-seo";
import { VsPageShell } from "../VsPageShell";

export const metadata: Metadata = withPublicSEO("/vs/clay", {
  title: "SyncedIn vs Clay: networking conversations and GTM workflows",
  description: "Compare Clay's data enrichment, research, and outbound workflows with SyncedIn's human-reviewed networking twins. Choose by the job you need done.",
  openGraph: { title: "SyncedIn and Clay: choose the workflow", type: "website" },
});

export default function VsClayPage() {
  return <VsPageShell
    competitor="Clay"
    competitorSlug="clay"
    positioning="a go-to-market workspace for enrichment, AI research, signals, and outbound workflows"
    ourPitch="A context-led networking conversation"
    theirPitch="A data and workflow platform for GTM teams"
    reviewedAt="2026-11-20"
    sources={[
      { label: "Clay data enrichment", url: "https://www.clay.com/use-cases/data-enrichment" },
      { label: "Clay outbound workflows", url: "https://www.clay.com/use-cases/outbound" },
      { label: "Clay pricing", url: "https://www.clay.com/pricing" },
    ]}
    rows={[
      { feature: "Primary job", syncedin: "Explore the context behind an introduction with editable twin conversations.", them: "Enrich records, research accounts, combine signals, and run GTM workflows.", highlight: true },
      { feature: "Working surface", syncedin: "A profile, invitation page, or conversation between twins.", them: "Data tables, research agents, workflow steps, and connected business systems." },
      { feature: "Personalization", syncedin: "Goals, background, preferences, and selected examples supplied to a twin.", them: "Enriched data and AI research used in tailored messaging and workflows." },
      { feature: "Outbound execution", syncedin: "A person decides whether and how to share an invitation. SyncedIn does not replace a sales sequencer.", them: "Native email sequencing and integrations with other sequencing tools." },
      { feature: "Recipient experience", syncedin: "An editable simulated conversation to inspect. A simulated reply is not the person's actual words.", them: "Depends on the campaign, channel, and workflow configured by the sender." },
      { feature: "Pricing decision", syncedin: "The current web signup has no paid checkout. Future pricing is not promised here.", them: "Check current plans, usage allowances, and the cost of your specific enrichment and workflow needs." },
    ]}
    whyWeWin={[
      { heading: "Start with the work you need to do", body: "A team that needs to enrich CRM records and coordinate outbound should evaluate Clay on those requirements. SyncedIn focuses on the context and draft conversation around an introduction. Treating the two as interchangeable can leave important work uncovered." },
      { heading: "Both products use context", body: "Clay describes AI research and personalized messaging, so the difference is not that only SyncedIn can personalize. SyncedIn's distinction is the editable twin-to-twin exchange and the human review of its proposed next step." },
      { heading: "Review the evidence behind a conversation", body: "Public information can be incomplete in any research-assisted workflow. On a SyncedIn invitation, a recipient-side draft is a simulation to correct, not evidence of agreement. Check names, assumptions, and commitments before acting." },
      { heading: "Use a concrete trial task", body: "For Clay, test a representative record and the workflow it must reach. For SyncedIn, test whether a draft captures the actual reason for an introduction. Compare accuracy, review effort, and useful outcomes instead of an unsupported response-rate promise." },
    ]}
    faq={[
      { q: "Can SyncedIn replace Clay for CRM enrichment?", a: "Not as a like-for-like substitute. Clay offers data enrichment and GTM workflows; SyncedIn is a networking-twin product. Review your required integrations and data operations before changing a production workflow." },
      { q: "Does Clay only write generic outbound templates?", a: "No. Clay's current product pages describe AI research, enriched context, personalized messages, and outbound execution. The comparison is about the workflow and human experience, not a claim that Clay lacks contextual AI." },
      { q: "Can I use both?", a: "They can serve different jobs in your process. This page does not claim a native Clay-to-SyncedIn integration or automatic transfer. Share only information you have permission to use and review any invitation separately." },
      { q: "Which is cheaper?", a: "There is no universal price comparison for different jobs. Check Clay's current pricing and the usage your task requires. SyncedIn's current web signup has no paid checkout, but that is not a promise of future prices or comparable sales-workflow capacity." },
      { q: "Is one proven to get better replies?", a: "This page does not present an independent head-to-head study. An accurate record, a draft conversation, a reply, and a useful introduction are different outcomes." },
    ]}
  />;
}
