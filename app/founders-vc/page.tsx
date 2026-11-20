import type { Viewport } from "next";
import { withPublicSEO } from "@/lib/public-seo";
import { VerticalLandingShell } from "../(verticals)/VerticalLandingShell";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata = withPublicSEO("/founders-vc", {
  title: "Founder and investor introductions with SyncedIn",
  description: "Prepare a more intentional investor introduction with relevant public context, a clear reason to connect, and a twin draft for human review. No funding or reply guarantee.",
});

export default function FoundersVCPage() {
  return <VerticalLandingShell
    slug="founders-vc"
    eyebrow="For founders exploring an introduction"
    headline="Founder and investor introductions"
    subhead="Explain why a particular conversation could be useful. A SyncedIn twin can help prepare the context and explore a possible next step for people to review."
    manifestoOne="An investor's public thesis, work, or portfolio can help you form a relevant question. It does not tell you that they are currently investing, interested in your company, or willing to take a meeting. Start by checking the current source and the actual person you want to reach."
    manifestoTwo="Give your twin the professional context you are comfortable sharing and the purpose of the introduction. Review the draft for accuracy and remove assumed endorsements, availability, or funding commitments. SyncedIn does not guarantee investor acceptance or a fundraising outcome."
    pillars={[
      { k: "01", t: "Choose what you want to discuss", d: "Name the company or problem, your current question, and why this person's work seems relevant. Leave sensitive financial, customer, and personal information out of an initial public-source draft." },
      { k: "02", t: "Verify the reason for the introduction", d: "Check the person's role and current public statements. A past investment or social post can be a starting point, but it is not confirmation of today's mandate or interest." },
      { k: "03", t: "Propose a next step they can choose", d: "A question in the current channel may be enough. When someone offers an introduction, ask whether both people are comfortable with it before sharing contact details or adding them to a thread." },
    ]}
    questions={[
      { title: "Why this person, rather than a generic investor list?", detail: "Identify one relevant, current piece of professional context. Do not imply a relationship with the person or their firm merely because you read a public source." },
      { title: "Is your purpose clear?", detail: "Be direct about whether you are seeking feedback, learning about a sector, or asking about fundraising fit. Do not disguise a fundraising request as an unrelated research conversation." },
      { title: "What may be shared in a first exchange?", detail: "Choose a brief summary you are comfortable having forwarded. Share confidential materials only through an appropriate, agreed process, not because a twin generated a plausible reason to send them." },
      { title: "What would a useful response look like?", detail: "A clarification, a referral offered with permission, or an honest no may all be useful. A draft meeting, introduction, or investment is not an accepted commitment." },
    ]}
    sources={[
      { href: "https://avc.com/2009/11/the-double-optin-introduction/", label: "Fred Wilson: the double-opt-in introduction" },
      { href: "https://www.linkedin.com/help/linkedin/answer/a554575", label: "LinkedIn: messaging access and recipient settings" },
    ]}
    ctaPrimary="Build my founder twin"
    ctaSecondary="Read the hypernetwork vision"
  />;
}
