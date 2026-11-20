import type { Metadata } from "next";
import { withPublicSEO } from "@/lib/public-seo";
import { VsPageShell } from "../VsPageShell";

export const metadata: Metadata = withPublicSEO("/vs/lemlist", {
  title: "SyncedIn vs lemlist: networking twins and outbound campaigns",
  description: "Compare lemlist's AI-assisted outbound campaigns with SyncedIn's editable networking-twin conversations. Understand channels, review, and the work each product covers.",
  openGraph: { title: "SyncedIn and lemlist: conversation or campaign?", type: "website" },
});

export default function VsLemlistPage() {
  return <VsPageShell
    competitor="lemlist"
    competitorSlug="lemlist"
    positioning="an outbound platform with prospecting, AI research, personalized campaigns, and multichannel outreach"
    ourPitch="A human-reviewed networking twin"
    theirPitch="An AI-assisted outbound campaign workflow"
    reviewedAt="2026-11-20"
    sources={[
      { label: "lemlist multichannel prospecting", url: "https://www.lemlist.com/product/multichannel-prospecting" },
      { label: "lemAgent", url: "https://www.lemlist.com/product/lemagent" },
      { label: "lemlist pricing", url: "https://www.lemlist.com/pricing" },
    ]}
    rows={[
      { feature: "Primary job", syncedin: "Prepare and explore a relevant introduction through twin conversations.", them: "Research prospects and manage outbound campaigns across supported channels.", highlight: true },
      { feature: "AI assistance", syncedin: "Draft exchanges from goals, background, preferences, and selected examples.", them: "Agents for research, enrichment, messaging, and campaign preparation." },
      { feature: "What gets shared", syncedin: "A SyncedIn invitation page when a person chooses to share it.", them: "Messages and outreach steps in the campaign you configure." },
      { feature: "Channels", syncedin: "Its own profiles and conversations. Sharing a link does not create a native campaign integration.", them: "Email and additional channels depending on the current plan, configuration, and add-ons." },
      { feature: "Recipient control", syncedin: "Inspect and correct a simulated conversation, then choose whether to engage.", them: "Recipients respond or decline through the selected channel. Their experience depends on the sender's campaign." },
      { feature: "Pricing decision", syncedin: "The current web signup has no paid checkout; no future pricing promise is made here.", them: "Check billing cycle, seats or sending volume, channel features, and any data or messaging add-ons." },
    ]}
    whyWeWin={[
      { heading: "Choose a campaign tool for campaign operations", body: "If you need sequence scheduling, channel coordination, deliverability tools, and campaign management, evaluate lemlist against those needs. A SyncedIn invitation is not a replacement for that operational surface." },
      { heading: "Use a twin to explore the reason to meet", body: "SyncedIn is useful when there is a plausible overlap but the conversation still needs shape. A twin exchange can draft that exploration. It does not guarantee the recipient's interest or make a proposed next step an accepted agreement." },
      { heading: "AI personalization is not exclusive to SyncedIn", body: "lemlist now describes research and messaging agents as well as campaign assistance. SyncedIn's distinction is its editable twin conversation and review of the proposed outcome, not a claim that other products only perform static mail merge." },
      { heading: "Measure a result that fits the job", body: "For an outbound platform, assess the configured workflow, delivery, data quality, and actual recipient responses. For SyncedIn, inspect whether the draft is accurate and whether the proposed introduction is useful. A larger message count alone does not establish relationship quality." },
    ]}
    faq={[
      { q: "Is SyncedIn a complete lemlist replacement?", a: "No like-for-like replacement is claimed. lemlist supports outbound campaign operations. SyncedIn focuses on context-led introductions and twin conversations. Match the product to the work you actually need." },
      { q: "Does SyncedIn automatically import or sync my lemlist campaigns?", a: "This comparison does not claim a native campaign sync, maintained export compatibility, or a direct integration. Review any contact information and permissions before using it in an invitation." },
      { q: "Does lemlist only use static templates?", a: "No. Its current product pages describe AI research, enrichment, messaging, and campaign assistance. Features depend on the current offering and account configuration." },
      { q: "Does a SyncedIn twin send LinkedIn messages for me?", a: "No. A draft or shareable invitation is not authorization to control your LinkedIn account. Review the final message, recipient preferences, and the rules of the channel you use." },
      { q: "Can you compare prices directly?", a: "Check the current vendor plans and the capacity your task needs. Billing cycle, volume, users, channels, and add-ons can change the total. SyncedIn's current web signup has no paid checkout, but future pricing and equivalent campaign capacity are not promised." },
    ]}
  />;
}
