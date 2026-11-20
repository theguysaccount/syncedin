import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";

export function VerticalLandingShell({ slug, eyebrow, headline, subhead, manifestoOne, manifestoTwo, pillars, ctaPrimary, ctaSecondary, questions, sources }: {
  slug: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  manifestoOne: string;
  manifestoTwo: string;
  pillars: { k: string; t: string; d: string }[];
  ctaPrimary: string;
  ctaSecondary: string;
  questions: { title: string; detail: string }[];
  sources: { href: string; label: string }[];
}) {
  const onboardingPath = `/onboarding?welcome=1&vertical=${encodeURIComponent(slug)}`;
  const signupHref = `/login?${new URLSearchParams({ next: onboardingPath })}`;
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <header className={styles.header}>
        <div className={styles.meta}><span>{eyebrow}</span></div>
        <h1>{headline}</h1>
        <p className={styles.introduction}>{subhead}</p>
        <div className={styles.actionRow}><Link href={signupHref} className={styles.primaryLink}>{ctaPrimary}<ArrowRight size={18} aria-hidden="true" /></Link><Link href="/hypernetwork" className={styles.secondaryLink}>{ctaSecondary}<ArrowRight size={17} aria-hidden="true" /></Link></div>
      </header>
      <div className={styles.body}>
        <h2>Start with a concrete reason to talk</h2>
        <p>{manifestoOne}</p><p>{manifestoTwo}</p>
        <h2>A conversation you can review</h2>
        <ol className={styles.steps}>{pillars.map(pillar => <li key={pillar.k}><h3>{pillar.t}</h3><p>{pillar.d}</p></li>)}</ol>
        <h2>Questions to clarify together</h2>
        {questions.map(question => <section key={question.title}><h3>{question.title}</h3><p>{question.detail}</p></section>)}
        <h2>Keep the next step in scope</h2>
        <p>A draft can clarify the topic without creating a meeting, commitment, or agreement. Check names and claims, ask about unknown details, and confirm the real next step with the person. A score or a public-source guess is not their consent.</p>
        <p>The <Link href="/guides/networking-goals">conversation-goal builder</Link> helps put your purpose and boundaries into words. For the first message, use the <Link href="/guides/linkedin-connection-request">connection-note examples</Link>. When a mutual contact offers to connect you, follow the <Link href="/guides/warm-introduction">warm-introduction steps</Link>. After an exchange, consider a <Link href="/guides/networking-follow-up">thoughtful follow-up</Link>.</p>
        <section className={styles.sourceList} aria-label="Sources and limits"><h2>Sources and limits</h2><p>SyncedIn's editorial guidance, reviewed <time dateTime="2026-11-20">November 20, 2026</time>. These sources provide background, not an endorsement of SyncedIn or a measured success rate.</p><ul>{sources.map(source => <li key={source.href}><a href={source.href}>{source.label}</a></li>)}</ul></section>
      </div>
      <section className={styles.nextStep} aria-labelledby={`${slug}-next-step`}>
        <div><h2 id={`${slug}-next-step`}>Give the introduction useful context.</h2><p>Create a twin from the context you choose, inspect the draft, and decide which next step is worth proposing.</p></div>
        <Link href={signupHref} className={styles.primaryLink}>{ctaPrimary}<ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
      <footer className={styles.byline}><Link href="/">syncedin.org</Link> / <Link href="/hypernetwork">The hypernetwork vision</Link></footer>
    </main>
  </div>;
}
