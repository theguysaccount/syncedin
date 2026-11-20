import type { Viewport } from "next";
import { withPublicSEO } from "@/lib/public-seo";
import { VerticalLandingShell } from "../(verticals)/VerticalLandingShell";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata = withPublicSEO("/founders-cofounder", {
  title: "Find a cofounder: context-led conversations with SyncedIn",
  description: "Explore a potential cofounder connection with clear goals, complementary work, and an editable twin conversation. Review the fit and choose a real next step together.",
});

export default function FoundersCofounderPage() {
  return <VerticalLandingShell
    slug="founders-cofounder"
    eyebrow="For founders and builders"
    headline="Find a cofounder"
    subhead="Start with the work you want to do together. A SyncedIn twin can help explore the overlap, so your first real conversation has a clearer purpose."
    manifestoOne="A complementary skill is a reason to talk, not enough evidence to form a company together. Your interest in the problem, working style, expectations, and actual experience collaborating can matter as much as the headline on a profile."
    manifestoTwo="Use SyncedIn to prepare that first exploration from context you choose to share. An invitation can include a simulated conversation for the other person to inspect and correct. It cannot read everyone's complete history, verify a personality, or establish that someone wants to become your cofounder."
    pillars={[
      { k: "01", t: "Describe the problem and your contribution", d: "Explain what you are building, the work you can do, and what you want to learn from a potential collaborator. Keep sensitive business or personal information out of a first introduction." },
      { k: "02", t: "Look for a specific overlap", d: "Review the person's actual work and stated interests. Public information can be incomplete or outdated. Treat a suggested match as a question to investigate." },
      { k: "03", t: "Review the draft, then speak as people", d: "Correct the twin's assumptions and propose one small exchange. A simulated reply is not the person's words, and a promising chat is not an accepted role or partnership." },
    ]}
    questions={[
      { title: "Which problem do you both want to work on?", detail: "Compare the problem itself, why it matters to each of you, and what you would do if the first idea changed. Avoid inferring commitment from enthusiasm in a single message." },
      { title: "What would each person actually contribute?", detail: "Discuss concrete work, relevant experience, and gaps you still need to understand. A complementary job title does not show how you collaborate under real constraints." },
      { title: "Which working expectations need a direct conversation?", detail: "Ask about availability, communication, location, and how you would handle disagreement. Do not infer someone's schedule, personal circumstances, or willingness to leave another role." },
      { title: "What small collaboration would give you useful evidence?", detail: "If both people want to continue, agree on a bounded activity and how you will review it. Treat any roles, ownership, money, or formal commitments as separate decisions for the actual people and appropriate advisers." },
    ]}
    sources={[
      { href: "https://www.ycombinator.com/blog/10-questions-to-discuss-with-a-potential-co-founder", label: "Y Combinator: questions to discuss with a potential cofounder" },
      { href: "https://www.ycombinator.com/cofounder-matching", label: "Y Combinator's separate cofounder-matching service" },
    ]}
    ctaPrimary="Build my founder twin"
    ctaSecondary="Read the hypernetwork vision"
  />;
}
