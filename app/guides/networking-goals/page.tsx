import type { Metadata } from "next";
import Link from "next/link";
import { withPublicSEO } from "@/lib/public-seo";
import { NETWORKING_GUIDES } from "@/lib/networking-guides";
import { GuideLayout } from "../GuideLayout";
import { ConversationGoalBuilder } from "../ConversationGoalBuilder";
import styles from "../guides.module.css";

const guide = NETWORKING_GUIDES[3];
export const metadata: Metadata = withPublicSEO("/guides/networking-goals", {
  title: "Networking goals: examples and a private conversation-brief builder",
  description: guide.description,
  openGraph: { type: "article" },
});

export default function NetworkingGoalsGuide() {
  return <GuideLayout guide={guide}>
    <ConversationGoalBuilder />
    <div className={styles.leadAnswer}><p>A useful networking goal names <strong>something you want to understand or explore with a particular person</strong>. Add what you can contribute, one possible next step, and what is out of scope. The other person still chooses whether that conversation makes sense for them.</p></div>
    <h2>Separate the larger ambition from this conversation</h2>
    <p>"Find collaborators" is a direction. "Compare the onboarding problem we are each working on" is a conversation. Both can matter, but asking a first exchange to deliver your entire ambition creates pressure and makes a draft harder to judge.</p>
    <p>Keep your general profile broad enough to describe what matters to you. Give a particular conversation a narrower purpose when the context changes. A research exchange should not inherit a fundraising pitch just because raising money is another goal in your profile.</p>
    <h2>Four parts of a workable brief</h2>
    <ol>
      <li><strong>Purpose:</strong> the specific question, overlap, or uncertainty worth discussing.</li>
      <li><strong>Contribution:</strong> something real you can bring, without inventing access, expertise, or an endorsement.</li>
      <li><strong>Possible next step:</strong> a small exchange to propose, not an outcome that is already agreed.</li>
      <li><strong>Boundaries:</strong> topics, promises, disclosures, or follow-up that should stay out of the conversation.</li>
    </ol>
    <h2>Examples of broad goals made specific</h2>
    <section><h3>From "meet people in AI" to a shared research question</h3><blockquote className={styles.example}><p>Compare how we evaluate reasoning-model calibration. I can share one method and its limitations. Ask whether exchanging a short summary here would be useful. Do not propose a sales call or share private datasets.</p></blockquote><p>The brief gives a person a recognizable topic and makes the limits explicit. It does not assume that two people working in the same field want the same thing.</p></section>
    <section><h3>From "find a collaborator" to one concrete overlap</h3><blockquote className={styles.example}><p>Explore the overlap between accessible onboarding and multilingual forms. I can explain one design decision. Compare one difficult problem before discussing a project together. Do not imply a role, partnership, or time commitment.</p></blockquote><p>A small exchange can reveal whether there is a useful fit. A draft partnership proposal is not evidence that the other person has agreed to join.</p></section>
    <section><h3>From "make the event worthwhile" to continuing one discussion</h3><blockquote className={styles.example}><p>Continue our meetup conversation about active small communities. Offer the first-week prompt I mentioned. Ask whether comparing one lesson in this thread would help. No mailing-list subscription or recurring outreach.</p></blockquote><p>Use details that actually happened. A believable invented memory can damage trust as easily as an incorrect name.</p></section>
    <h2>Judge the draft against the goal</h2>
    <p>Read the next message and ask whether it advances the actual purpose. A polished paragraph can still be wrong if it introduces a different business offer, assumes a meeting, or speaks as though the recipient already consented.</p>
    <ul><li>Check names, shared context, and factual claims.</li><li>Keep uncertain details as questions.</li><li>Remove commitments you cannot authorize.</li><li>Confirm the proposed next step with the real person.</li><li>Respect a refusal or a request not to continue.</li></ul>
    <h2>Using a goal with a networking twin</h2>
    <p>SyncedIn supports a specific conversation goal alongside your general twin context. That goal guides drafting for that conversation. A boundary such as "exchange research only, no meeting or pitch" makes the intended scope clearer, but a generated draft still needs your review.</p>
    <p>The brief above uses the current conversation editor's 500-character budget, including its labels and line breaks. It remains a local draft. Copying it does not save a goal, update your twin, or contact anyone.</p>
    <p>When a draft sounds wrong, keep your correction tied to the audience and purpose. <Link href="/guides/ai-networking">Contextual feedback</Link> can inform later drafting without establishing a separately trained model or guaranteed future accuracy.</p>
    <h2>A useful outcome can be a clearer no</h2>
    <p>A good conversation does not have to end in a meeting. You might learn that your interests overlap only slightly, that timing is wrong, or that a resource exchange is enough. Those are useful decisions when they are based on accurate context and the people's actual choices.</p>
    <p>For the first invitation, use the <Link href="/guides/linkedin-connection-request">connection-note guide</Link>. After an existing exchange, the <Link href="/guides/networking-follow-up">follow-up guide</Link> helps you continue without increasing pressure.</p>
    <section className={styles.sourceList} aria-label="Sources"><h2>Sources and limits</h2><p>This is SyncedIn's editorial framework, with fictional examples, not a tested promise of more replies or meetings. The product description follows the existing conversation-goal editor and drafting workflow, reviewed November 20, 2026. Read the <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link> before sharing real context with a twin.</p></section>
  </GuideLayout>;
}
