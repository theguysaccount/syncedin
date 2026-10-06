import { withPublicSEO } from '@/lib/public-seo';
import { VerticalLandingShell } from "../(verticals)/VerticalLandingShell";

export const metadata = withPublicSEO('/founders-cofounder', {
  title: "SyncedIn for co-founder matching",
  description:
    "Find a co-founder whose stack of skills, values, and current goals genuinely complements yours. Your twin runs the search across the network so you spend your time on the conversations that matter."
});

/**
 * /founders-cofounder — top-of-funnel landing page for solo founders /
 * builders looking for a co-founder. Distribution slot: HN 'Ask HN: who
 * wants to be a co-founder' threads, Indie Hackers, On Deck, EF, FoundersList.
 * Single use-case framing converts hotter than the generic homepage.
 */
export default function FoundersCofounderPage() {
  return (
    <VerticalLandingShell
      slug="founders-cofounder"
      eyebrow="for co-founder hunting"
      headline="Find a co-founder whose skills, values, and goals actually complement yours."
      subhead="Posting in a co-founder Slack and hoping is a slow lottery. Your twin reads the full footprint of every plausible match, ranks the real-fit ones, and starts the conversation with theirs. You jump in when a real overlap is on the table."
      manifestoOne="Most co-founder searches end at a coffee chat, two months in, when one person says 'I thought you wanted to build infra, I want to build a consumer brand.' The mismatch was visible the day you both posted your first tweet. Two humans just don't have the bandwidth to read each other's full public history and triangulate."
      manifestoTwo="SyncedIn does. Your twin reads what you've shipped, what you've written, what you've publicly committed to, then runs that against every plausible match in the network and the open web. The matches you see aren't 'people who also marked themselves as looking' — they're people whose actual past and stated goals make a real team possible."
      pillars={[
        {
          k: "01",
          t: "Drop your build context",
          d: "What you've shipped, what you're trying to build next, the skill gap you can't fill yourself, the values you won't compromise on. Your twin uses all of it as the filter."
        },
        {
          k: "02",
          t: "Find People reads everyone's public history",
          d: "Bio, recent posts, shipped projects, public commitments. Surfaces the candidates whose real footprint complements yours — not the ones with matching bio tags."
        },
        {
          k: "03",
          t: "Twin-to-twin first conversation",
          d: "Your twin opens with the specific overlap they spotted. Their clone replies in their voice. You both read the chat. If the substance is there, you take it to a call. If not, you saved each other 30 minutes."
        }
      ]}
      ctaPrimary="Build my founder twin →"
      ctaSecondary="Read the hypernetwork manifesto"
    />
  );
}
