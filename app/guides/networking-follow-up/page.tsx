import type { Metadata } from "next";
import Link from "next/link";
import { withPublicSEO } from "@/lib/public-seo";
import { NETWORKING_GUIDES } from "@/lib/networking-guides";
import { GuideLayout } from "../GuideLayout";
import styles from "../guides.module.css";

const guide = NETWORKING_GUIDES[1];
export const metadata: Metadata = withPublicSEO("/guides/networking-follow-up", {
  title: "Networking follow-up messages: after events, introductions, and silence",
  description: guide.description,
  openGraph: { type: "article" },
});

export default function FollowUpGuide() {
  return <GuideLayout guide={guide}>
    <div className={styles.leadAnswer}><p>A useful follow-up <strong>restores the context, adds a reason to continue, and asks for one small next step</strong>. It does not make the recipient defend their silence. The right message depends on whether you met, were introduced, or have never spoken.</p></div>
    <h2>After a conference or meetup</h2>
    <p>Send while you can still describe the conversation accurately. "Great meeting you" is a start, but it does not help someone place you among the other people they met. Name the topic, the place in the event where you talked, or the question you were working through.</p>
    <blockquote className={styles.example}><p>Hi Sam, I enjoyed our conversation after the community-products session about keeping small groups active. Your point about giving newcomers a first contribution stuck with me. Would you be open to comparing the first-week prompts we each use?</p></blockquote>
    <p>The ask follows from the conversation. If you actually promised a resource, attach the right one. If you did not, do not invent a promise to create an obligation. A meeting is one possible next step, not the default outcome of every exchange.</p>
    <h2>After a warm introduction</h2>
    <p>Thank the introducer and explain the overlap in your own words. An introduction gives you context, not an endorsement of every claim you make. Do not imply that your introducer guaranteed funding, a role, a partnership, or someone's time.</p>
    <blockquote className={styles.example}><p>Thanks for connecting us, Lee. Noor, I'm building onboarding for multilingual communities, and Lee thought our approaches might overlap. Is comparing one difficult onboarding decision a useful place to start?</p></blockquote>
    <p>Keep the first exchange easy to answer in the same channel. If scheduling becomes the right next step, confirm the time and participants directly instead of assuming availability.</p>
    <h2>After a message gets no reply</h2>
    <p>Silence is ambiguous. They may be busy, the timing may be wrong, or your request may not be relevant. None of those possibilities gives you a reason to increase pressure. One thoughtful follow-up can clarify your request; repeated "bumping this" messages add little.</p>
    <blockquote className={styles.example}><p>Hi Ari, one clarification on my earlier note: I'm interested in how you evaluate small community pilots, not asking for a sales call. If that is relevant to your work, would exchanging one lesson here be useful? No need to reply if the timing is not right.</p></blockquote>
    <p>Use this structure only when the clarification is true. There is no universal evidence-backed number of days or magic sequence that guarantees a reply. Allow a reasonable interval for your context, respect explicit preferences, and stop after a clear no or a request not to be contacted.</p>
    <h2>Choose one next step</h2>
    <div className={styles.tableWrap} role="region" aria-label="Follow-up context comparison" tabIndex={0}><table><caption>Match the ask to what you actually know about the relationship.</caption><thead><tr><th scope="col">Context</th><th scope="col">A bounded next step</th><th scope="col">Avoid assuming</th></tr></thead><tbody>
      <tr><th scope="row">A shared research question</th><td>Compare one method or result in the current thread.</td><td>A call, collaboration, or agreement already exists.</td></tr>
      <tr><th scope="row">A possible complementary skill</th><td>Exchange one concrete problem you are each working on.</td><td>They want to become a cofounder.</td></tr>
      <tr><th scope="row">A genuine requested resource</th><td>Send the specific item and explain why it is relevant.</td><td>They consented to a newsletter or recurring outreach.</td></tr>
      <tr><th scope="row">An unanswered first message</th><td>Clarify your reason once, or leave the thread alone.</td><td>The person owes you a response.</td></tr>
    </tbody></table></div>
    <h2>Keep a small, useful context note</h2>
    <p>Record where you met, what was actually discussed, your reason for continuing, and any explicit commitment. Keep uncertainty visible: "might be interested in a pilot" is not "agreed to a pilot." Avoid sensitive personal details that do not belong in a professional follow-up.</p>
    <p>If you use a SyncedIn twin, put that purpose into the conversation goal and review the generated proposal against it. A twin can help draft a next step, but it cannot turn an inferred interest into the other person's consent. <Link href="/guides/ai-networking">The AI-networking guide</Link> explains that boundary.</p>
    <h2>A stop rule is part of a good follow-up</h2>
    <p>Do not switch to someone's personal phone or another account just because they did not answer in the original channel. Respect blocks, opt-outs, event rules, and the person's stated preferences. Leave a clear, low-pressure thread that they can reopen later.</p>
    <p>Need the first invitation instead? Start with the <Link href="/guides/linkedin-connection-request">connection-note examples and length checker</Link>.</p>
    <section className={styles.sourceList} aria-label="Sources"><h2>Sources and limits</h2><p>The examples are fictional, editorial guidance from SyncedIn, not measured conversion experiments. For LinkedIn, consult its current <a href="https://www.linkedin.com/help/linkedin/answer/a554575">messaging access rules</a> and <a href="https://www.linkedin.com/help/linkedin/answer/a1341543">automation policy</a>. They do not establish a universal follow-up schedule. Reviewed November 19, 2026.</p></section>
  </GuideLayout>;
}
