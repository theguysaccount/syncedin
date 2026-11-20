import type { Metadata } from "next";
import Link from "next/link";
import { withPublicSEO } from "@/lib/public-seo";
import { CONNECTION_NOTE_EXAMPLES, NETWORKING_GUIDES } from "@/lib/networking-guides";
import { GuideLayout } from "../GuideLayout";
import { ConnectionNoteEditor } from "../ConnectionNoteEditor";
import styles from "../guides.module.css";

const guide = NETWORKING_GUIDES[0];
export const metadata: Metadata = withPublicSEO("/guides/linkedin-connection-request", {
  title: "LinkedIn connection request notes: examples and character checker",
  description: guide.description,
  openGraph: { type: "article" },
});

export default function ConnectionRequestGuide() {
  return <GuideLayout guide={guide}>
    <ConnectionNoteEditor />
    <div className={styles.leadAnswer}><p>A useful connection note answers two questions: <strong>why this person, and why this conversation?</strong> Name one real piece of context, explain your reason, and leave room for them to decide. You do not need to fit your entire pitch into an invitation.</p></div>
    <h2>Start with a reason, not a compliment</h2>
    <p>"Impressive background" could be sent to almost anyone. A reference to a specific project, discussion, event, or shared problem gives the recipient something they can recognize. Specific does not mean invasive: use relevant professional information they chose to share, not personal details gathered to manufacture familiarity.</p>
    <p>A simple structure is <strong>shared context + your reason + a modest invitation</strong>. If your reason is still "they look interesting," read further before reaching out. The note gets clearer when you can name the conversation you actually want to have.</p>
    <h2>Four examples for different intentions</h2>
    <p>These are fictional examples, not messages to copy with only the name changed. Replace the details with something true about the person and your purpose.</p>
    {CONNECTION_NOTE_EXAMPLES.map(example => <section key={example.id}><h3>{example.label}</h3><blockquote className={styles.example}><p>{example.text}</p></blockquote><p>{example.reason}</p></section>)}
    <h2>Is the limit 200 or 300 characters?</h2>
    <p><a href="https://www.linkedin.com/help/linkedin/answer/a563153/personalizing-invitations-to-connect?lang=en">LinkedIn's current invitation help</a> describes a 200-character personalized note for basic members and plan-dependent allowances. Older examples and some account experiences show 300. Use the allowance shown in your own composer; a 300-character draft is not a guarantee that your account can send it.</p>
    <p>When space is tight, cut the greeting padding, repeated job titles, and a second ask. Keep the detail that explains why you chose this person. A short note with one clear reason is more useful than a full pitch compressed into abbreviations.</p>
    <h2>A connection note is not a DM or an InMail</h2>
    <p>A note accompanies a request to connect. A normal LinkedIn message lives in an existing conversation, while InMail is a separate way to reach people outside your network. <a href="https://www.linkedin.com/help/linkedin/answer/a554575">Messaging access depends on your connection and the recipient's settings</a>. Do not apply an invitation-note limit to every LinkedIn message.</p>
    <h2>Before you send</h2>
    <ul>
      <li>Check the name and the specific work you referenced. A plausible-looking error still breaks trust.</li>
      <li>Make your actual purpose visible. Do not disguise a sales request as an unrelated research conversation.</li>
      <li>Remove promises, referrals, availability, and shared connections you cannot substantiate.</li>
      <li>Leave out the calendar link unless the relationship and context genuinely call for it.</li>
      <li>Review the final text in LinkedIn. This guide does not send invitations or automate your account.</li>
    </ul>
    <h2>When your usual voice does not fit the context</h2>
    <p>You might write differently to a research peer, a potential collaborator, and someone you met socially at a conference. That is useful context, not an inconsistency to erase. Save the audience and the reason alongside a note you approve, so a future draft can use a relevant example without importing an old fundraising pitch or meeting request.</p>
    <p>SyncedIn's <Link href="/login?next=%2Fdashboard">Discover workflow</Link> supports an optional reason for connecting and edited connection-note examples. A contextual correction can inform later drafting; it does not establish a separately trained model or guarantee that the next draft will be right. Keep reviewing it.</p>
    <p>Already connected? The <Link href="/guides/networking-follow-up">networking follow-up guide</Link> covers how to continue a conversation without simply repeating your first request.</p>
    <section className={styles.sourceList} aria-label="Sources"><h2>Sources and limits</h2><p>LinkedIn's <a href="https://www.linkedin.com/help/linkedin/answer/a563153/personalizing-invitations-to-connect?lang=en">invitation help</a>, <a href="https://www.linkedin.com/help/linkedin/answer/a554575">messaging help</a>, and <a href="https://www.linkedin.com/help/linkedin/answer/a1341543">automation policy</a> were reviewed on November 19, 2026. Examples and the writing framework are SyncedIn's editorial guidance, not tested response-rate claims. SyncedIn is independent of LinkedIn.</p></section>
  </GuideLayout>;
}
