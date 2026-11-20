import type { Metadata } from "next";
import { withPublicSEO } from "@/lib/public-seo";
import { VsPageShell } from "../VsPageShell";

export const metadata: Metadata = withPublicSEO("/vs/linkedin-dms", {
  title: "SyncedIn vs LinkedIn DMs: choosing the right first message",
  description: "Compare a LinkedIn message with a shareable SyncedIn twin conversation. Understand connection notes, InMail, recipient control, and when a simple message is enough.",
  openGraph: { title: "SyncedIn and LinkedIn DMs: message or shared context?", type: "website" },
});

export default function VsLinkedInDmsPage() {
  return <VsPageShell
    competitor="LinkedIn DMs"
    competitorSlug="linkedin-dms"
    positioning="a way to contact people through LinkedIn's professional network, subject to connection status and recipient settings"
    ourPitch="A shareable, editable twin conversation"
    theirPitch="A direct message in an existing professional network"
    reviewedAt="2026-11-19"
    sources={[
      { label: "LinkedIn messaging help", url: "https://www.linkedin.com/help/linkedin/answer/a554575" },
      { label: "LinkedIn invitation help", url: "https://www.linkedin.com/help/linkedin/answer/a563153/personalizing-invitations-to-connect?lang=en" },
      { label: "LinkedIn automation policy", url: "https://www.linkedin.com/help/linkedin/answer/a1341543" },
    ]}
    rows={[
      { feature: "Where it lives", syncedin: "A SyncedIn invitation page or conversation.", them: "LinkedIn's own messaging interface.", highlight: true },
      { feature: "What the recipient sees", syncedin: "A simulated conversation they can inspect and correct; not a record of their actual words.", them: "The message you chose to send and the existing thread." },
      { feature: "How much context", syncedin: "A draft can explore goals and professional background you choose to provide.", them: "Ordinary messages, connection notes, and InMail are different formats. Do not apply a note's limit to every DM." },
      { feature: "Who acts", syncedin: "The people review proposed next steps. An AI draft does not confirm their consent or availability.", them: "You decide what to write and send through your LinkedIn account." },
      { feature: "Access and cost", syncedin: "The current web flow has no paid checkout; future prices or paid features are not promised here.", them: "First-degree messaging is free. Other access depends on recipient settings and products such as InMail." },
      { feature: "Expected results", syncedin: "No guaranteed response rate, time saving, or introduction.", them: "Results depend on the relationship, message, relevance, and the recipient's choice." },
    ]}
    whyWeWin={[
      { heading: "Use a direct message for a direct request", body: "If you already know the person or can explain your purpose in a few clear sentences, a normal message may be the best option. A twin conversation adds value only when exploring the context helps both people decide what to do next." },
      { heading: "Use a twin when the overlap needs exploration", body: "A possible collaboration can involve goals, preferences, and constraints that do not fit naturally into an opener. A SyncedIn conversation can help draft that exploration. Review every inferred claim, especially when the other person's twin was sketched from public information." },
      { heading: "A connection note is a separate format", body: "A personalized invitation accompanies a connection request; it is not an ordinary DM. LinkedIn's current invitation help describes a 200-character note for basic members and plan-dependent allowances. Check the composer in your own account instead of assuming a universal 300-character limit." },
      { heading: "A link still needs an honest introduction", body: "You can share a relevant SyncedIn invitation through an appropriate channel, including a LinkedIn message. Explain why it is useful to that person. An unexplained link is not a substitute for context, and sending one does not guarantee that someone will open it or reply." },
    ]}
    faq={[
      { q: "Does SyncedIn send LinkedIn messages for me?", a: "No. SyncedIn drafts context and conversations on its own platform. You review the wording and decide whether, where, and how to contact someone. It does not provide permission to automate LinkedIn or bypass its limits." },
      { q: "Is every LinkedIn message limited to 300 characters?", a: "No. Connection notes, regular messages, and InMail are different. LinkedIn's help currently describes a 200-character invitation note for basic members; actual allowances can depend on the account. Use the limit shown in your composer." },
      { q: "Is SyncedIn proven to get more replies?", a: "This comparison does not present a controlled head-to-head response-rate study. A draft conversation, a page visit, a reply, and a useful real-world outcome are separate things to measure." },
      { q: "Can I use both approaches?", a: "Yes. Write a short, relevant message and share a SyncedIn invitation when it adds useful context. The other person can decide whether to engage. For a simple request, the message alone may be enough." },
      { q: "Where can I check the LinkedIn rules?", a: "See LinkedIn Help's Personalize invitations to connect, Send messages on LinkedIn, and Automated activity on LinkedIn. The current account interface and recipient settings determine access. SyncedIn is independent of LinkedIn." },
    ]}
  />;
}
