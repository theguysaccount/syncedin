import type { Metadata } from "next";
import Link from "next/link";
import { withPublicSEO } from "@/lib/public-seo";
import { NETWORKING_GUIDES } from "@/lib/networking-guides";
import { GuideLayout } from "../GuideLayout";
import styles from "../guides.module.css";

const guide = NETWORKING_GUIDES[4];
export const metadata: Metadata = withPublicSEO("/guides/warm-introduction", {
  title: "Warm introduction email: double opt-in steps and examples",
  description: guide.description,
  openGraph: { type: "article" },
});

export default function WarmIntroductionGuide() {
  return <GuideLayout guide={guide}>
    <div className={styles.leadAnswer}><p>A warm introduction uses a real mutual relationship to explain why two people might benefit from talking. <strong>Ask the connector first, let them check the other person's interest, and make the shared introduction only after both people agree.</strong> A useful introduction provides context, not a claim on someone's time.</p></div>
    <h2>Choose an introduction for a reason, not a badge</h2>
    <p>A mutual contact shown on a profile may barely know the person. Before asking, consider whether your connector understands your work and can honestly explain the relevance. Do not ask them to imply an endorsement they cannot give.</p>
    <p>A direct, concise message may be simpler when the recipient publishes a preferred contact channel or the connector does not know them well. In his investor-email guidance, Michael Seibel explicitly cautions against spending too much time chasing a warm introduction. It is one route into a conversation, not a prerequisite or a guarantee of a reply.</p>
    <div className={styles.tableWrap} role="region" aria-label="Choose a route for an introduction" tabIndex={0}><table><caption>Use the relationship that actually exists.</caption><thead><tr><th scope="col">Situation</th><th scope="col">A reasonable route</th><th scope="col">Do not assume</th></tr></thead><tbody>
      <tr><th scope="row">A connector knows both people and sees a relevant overlap</th><td>Ask whether they are comfortable checking interest separately.</td><td>They have already agreed to recommend you.</td></tr>
      <tr><th scope="row">The recipient publishes a channel for this kind of request</th><td>Consider a short direct message through that channel.</td><td>An introduction is needed to be taken seriously.</td></tr>
      <tr><th scope="row">The only link is an unfamiliar profile connection</th><td>Check the actual relationship or use an appropriate direct route.</td><td>A connection badge means a close relationship.</td></tr>
      <tr><th scope="row">Either person declines or does not opt in</th><td>Do not make the shared introduction.</td><td>Silence means permission.</td></tr>
    </tbody></table></div>
    <h2>1. Ask the connector, with a forwardable summary</h2>
    <p>Explain who you want to meet, the specific reason, and the small next step you hope to propose. Give the connector a version that makes sense on its own, without requiring access to your previous thread. Ask what they are comfortable forwarding and leave them room to decline.</p>
    <p>The names and work below are fictional. Replace them with accurate, shareable details; they are not customer results or real endorsements.</p>
    <h3>Request to the connector</h3>
    <blockquote className={styles.example}><p>Hi Dev, would you be comfortable asking Jordan whether an introduction would be useful? I'm working on multilingual onboarding, and Jordan's public talk about welcoming new members raised a question about first-week participation. I'd like to compare one approach. I've included a short summary you can forward if appropriate. No problem if you aren't the right person to ask.</p></blockquote>
    <h3>Forwardable summary, written by the requester</h3>
    <blockquote className={styles.example}><p>I'm Nina, a product designer working on onboarding for multilingual communities. I'm testing how a first contribution can help new members participate. Jordan's talk about community welcomes prompted a question about balancing guidance with choice. Would exchanging one example by email be useful? I can share a non-confidential outline of the approach we're testing.</p></blockquote>
    <p>The summary says what Nina does, why this person is relevant, and what she is actually asking for. It does not claim Jordan wants to collaborate, include someone else's private details, or attach an unrequested confidential deck.</p>
    <h2>2. Check interest privately before connecting the thread</h2>
    <p>Fred Wilson's double-opt-in approach asks for agreement from each person before making the introduction. As the connector, share only the context the requester approved and describe your relationship accurately. If the proposed purpose, participants, or information to be shared changes, check again rather than stretching the original yes.</p>
    <h3>Permission check from the connector</h3>
    <blockquote className={styles.example}><p>Hi Jordan, Nina, a designer I worked with on a community project, asked about an introduction around multilingual onboarding. She would like to compare one first-contribution example by email. May I forward her short summary so you can decide whether an introduction is useful? I'll wait before putting you both on a thread.</p></blockquote>
    <p>In a real message, use only a relationship you can honestly describe. A yes to reading a summary is not yet a yes to a meeting, a group chat, or recurring contact. Wait for the actual introduction permission before moving to the next step.</p>
    <h2>3. Make a clear introduction after both people agree</h2>
    <p>Confirm the agreed channel, names, and purpose. Keep the connection short enough for each person to recognize why they are there. Do not add a calendar invitation, new participants, or unrelated sales material to an introduction they accepted for another reason.</p>
    <h3>The shared introduction</h3>
    <blockquote className={styles.example}><p>Nina and Jordan, thanks for agreeing to the introduction. Nina is testing first-contribution prompts for multilingual communities; Jordan has been exploring how new members choose to participate. You both wanted to compare one onboarding example by email. I'll leave you two to take it from here.</p></blockquote>
    <p>If you are receiving the introduction, thank the connector and continue with the agreed topic. Ask before expanding the commitment. The <Link href="/guides/networking-follow-up">follow-up guide</Link> covers the next exchange without turning it into a pressure sequence.</p>
    <h2>Make a no easy to give and respect</h2>
    <p>A connector can decline without explaining another person's private circumstances: "I'm not able to make this introduction, but thanks for the clear context." If the recipient declines, close the request rather than forwarding the refusal or asking the connector to keep pressing. Do not share their address or move the conversation to a personal phone number.</p>
    <h2>Where a twin can help, and where people decide</h2>
    <p>A SyncedIn twin can help draft the context and explore a possible next step. Use a <Link href="/guides/networking-goals">specific conversation goal</Link> and review the names, claims, and scope. A simulated recipient-side reply is not the person's words or permission to introduce them. Confirm the real people's choices in the channel you intend to use.</p>
    <p>For a possible cofounder, start with <Link href="/founders-cofounder">the work and expectations to explore together</Link>. For an investor introduction, <Link href="/founders-vc">make the purpose and current professional context clear</Link>. Neither a warm introduction nor a promising twin draft guarantees a role, funding, or a relationship.</p>
    <section className={styles.sourceList} aria-label="Sources"><h2>Sources and limits</h2><p>SyncedIn's original fictional examples and editorial guidance, reviewed November 20, 2026. <a href="https://avc.com/2009/11/the-double-optin-introduction/">Fred Wilson's double-opt-in introduction</a> supplies the permission-first principle. <a href="https://www.ycombinator.com/blog/how-to-email-early-stage-investors">Michael Seibel's investor-email guidance</a> provides a concise, direct-contact counterpoint. These are authors' practices, not measured SyncedIn response rates or a universal requirement for every relationship.</p></section>
  </GuideLayout>;
}
