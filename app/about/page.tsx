import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { withPublicSEO } from "@/lib/public-seo";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/about", {
  title: "About SyncedIn: context-led networking with digital twins",
  description: "SyncedIn helps people explore relevant introductions through editable digital-twin conversations. Learn who builds it, how human review works, and where to get help.",
  openGraph: { type: "website" },
});

export default function AboutPage() {
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <header className={styles.header}>
        <div className={styles.meta}><span>The people behind the twins</span></div>
        <h1>About SyncedIn</h1>
        <p className={styles.introduction}>A clearer reason to connect. A conversation worth having. A next step the people actually choose.</p>
      </header>
      <div className={styles.body}>
        <div className={styles.leadAnswer}><p><strong>SyncedIn is a digital-twin networking platform.</strong> You supply goals, background, preferences, and examples. Your twin can help explore a relevant introduction through a draft conversation that you review and correct.</p></div>
        <h2>Why we are building it</h2>
        <p>A professional profile can tell you what someone has done. It does not always tell you why the two of you should have a conversation now. That missing context is the starting point for SyncedIn.</p>
        <p>We want introductions to begin with a real question, complementary work, or shared intention. A twin can help explore that overlap before a meeting is proposed. The ambition is useful coordination between people, with the people's judgment still central.</p>
        <h2>What a twin does, and what it cannot decide</h2>
        <p>A twin is a working representation of the context you give it. It can draft a conversation and propose an outcome. It is not a complete copy of you, and it cannot establish another person's consent, confirm availability, or make an agreement merely by generating one.</p>
        <p>On an invitation page, a conversation sketched from public information is a simulation. It is not a transcript of the recipient's actual words. The person can inspect it, correct assumptions, and choose whether to engage.</p>
        <p>Edits can provide examples for later drafting in a similar context. That feedback is not a guarantee of permanent learning, a separately trained model, or error-free future messages.</p>
        <h2>Who builds SyncedIn</h2>
        <p>SyncedIn is a <a href="https://persist.org">Persist Ventures</a> project created by Jackson Jesionowski, also known as Jack. The <a href="https://github.com/theguysaccount/syncedin">public source repository</a> contains the web application and project documentation.</p>
        <p>For a product question, bug, accessibility issue, or account request, use <Link href="/support">SyncedIn Support</Link>. Product suggestions can go on the <Link href="/feedback">feedback board</Link>; keep credentials, private conversation details, and account information out of public reports.</p>
        <h2>Start with the context you choose</h2>
        <p>You can build a twin from information you provide or prepare an agent-assisted profile draft for review. An agent setup does not silently import your entire ChatGPT or Claude history. You choose what context to share and approve the profile in SyncedIn.</p>
        <p>Read the <Link href="/privacy">privacy policy</Link> for the actual data handling, service providers, and limits. The <Link href="/terms">terms</Link> describe responsibilities and acceptable use. Avoid sharing private information about another person without permission.</p>
        <h2>Independent of the platforms you already use</h2>
        <p>SyncedIn is independent of LinkedIn, OpenAI, and Anthropic. Supporting links, context imports, or agents does not imply their endorsement. A SyncedIn draft is not permission to automate a LinkedIn account or bypass another service's rules.</p>
        <h2>Explore a useful first step</h2>
        <ul>
          <li><Link href="/guides/networking-goals">Choose a specific conversation goal</Link>, including what is out of scope.</li>
          <li><Link href="/guides/linkedin-connection-request">Write a thoughtful connection note</Link> and check its length.</li>
          <li><Link href="/guides/ai-networking">Understand the digital-twin approach</Link> and the review it requires.</li>
          <li><Link href="/article">Read the original launch story</Link> for the idea behind the product.</li>
        </ul>
      </div>
      <section className={styles.nextStep} aria-labelledby="about-next-step">
        <div><h2 id="about-next-step">Put your context to work.</h2><p>Create a twin, inspect what it drafts, and decide what happens next.</p></div>
        <Link href="/login" className={styles.primaryLink}>Create your twin <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
    </main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@type": "AboutPage", "@id": "https://syncedin.org/about#page",
      name: "About SyncedIn", url: "https://syncedin.org/about", inLanguage: "en",
      description: "The purpose, team, human-review approach, and support resources for SyncedIn.",
      about: { "@type": "Organization", "@id": "https://syncedin.org/#organization", name: "SyncedIn", url: "https://syncedin.org" },
      image: "https://syncedin.org/about/opengraph-image.png",
    }).replace(/</g, "\\u003c") }} />
  </div>;
}
