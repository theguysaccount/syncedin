import { withPublicSEO } from '@/lib/public-seo';
import { VerticalLandingShell } from "../(verticals)/VerticalLandingShell";

export const metadata = withPublicSEO('/founders-vc', {
  title: "SyncedIn for founders × VCs",
  description:
    "Find a VC who actually backs your thesis. Your twin reads every public note, post, and portfolio company they care about and surfaces the ones who would say yes immediately."
});

/**
 * /founders-vc — top-of-funnel landing page for founders looking to match
 * with the right investor. Shareable into entrepreneur boards (YC, OnDeck,
 * IndieHackers), accelerator alumni Slacks, conference channels. The
 * use-case is singular so the page converts hotter than the generic
 * homepage which has to talk to many audiences at once.
 */
export default function FoundersVCPage() {
  return (
    <VerticalLandingShell
      slug="founders-vc"
      eyebrow="for founders raising"
      headline="Find the VCs who actually back your thesis."
      subhead="Your twin reads every public note, post, and portfolio company a VC has put on the open internet — then surfaces the ones who would say yes to your round immediately. No cold-DM lottery. No 'just sending you my deck.'"
      manifestoOne="Most pitch loops are a slow lottery. You send the same deck to 80 funds, get 5 calls, 4 are wrong fit, and you burn three months learning what the VC already knew about themselves the day they started their fund. The win-win was visible before any meeting ever happened — your twin should have caught it."
      manifestoTwo="SyncedIn flips the loop. Your twin reads the VC's actual stated thesis (recent investments, Twitter takes, fund updates) against your goals and stage. When there's a real match, the two twins start the conversation. You see the chat, edit anything, accept the meeting only when the win-win is already on the table."
      pillars={[
        {
          k: "01",
          t: "Drop your raise context",
          d: "Stage, sector, traction, who you're already talking to. Your twin uses this to filter — it never pitches you to a fund whose last three investments contradict your space."
        },
        {
          k: "02",
          t: "Find People surfaces the real fits",
          d: "Scans the platform + open web for VCs whose public footprint actually overlaps your raise. Sorted by win-win density, not vanity reach."
        },
        {
          k: "03",
          t: "Your twin opens the conversation",
          d: "A real opener that references their specific portfolio company, post, or thesis line. Their clone replies in their voice. The clones surface what the meeting would actually be about before either of you spends 30 minutes."
        }
      ]}
      ctaPrimary="Build my founder twin →"
      ctaSecondary="Read the hypernetwork manifesto"
    />
  );
}
