import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { withPublicSEO } from "@/lib/public-seo";
import { PRODUCT_FAQS, PRODUCT_FAQ_REVIEWED_AT } from "@/lib/product-faq";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/faq", {
  title: "SyncedIn FAQ: accounts, AI twins, privacy, and messaging",
  description: "Answers about SyncedIn profiles, agent-assisted setup, conversation goals, contextual feedback, sync scores, phone-message consent, privacy, and getting help.",
});

export default function FaqPage() {
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <header className={styles.header}>
        <div className={styles.meta}><span>Answers before you connect</span></div>
        <h1>SyncedIn FAQ</h1>
        <p className={styles.introduction}>Accounts, twins, privacy, and the choices that stay with you.</p>
        <p className={styles.byline}>Reviewed <time dateTime={PRODUCT_FAQ_REVIEWED_AT}>November 20, 2026</time></p>
      </header>
      <div className={styles.faqList}>
        {PRODUCT_FAQS.map((item, index) => <details key={item.id} id={item.id} open={index < 2}>
          <summary><span>{item.q}</span><ChevronDown size={18} aria-hidden="true" /></summary>
          <div className={styles.faqAnswer}><p>{item.a}</p><div className={styles.faqLinks}>{item.links.map(link => <Link href={link.href} key={link.href}>{link.label}<ArrowRight size={15} aria-hidden="true" /></Link>)}</div></div>
        </details>)}
      </div>
      <section className={styles.nextStep} aria-labelledby="faq-support-heading">
        <div><h2 id="faq-support-heading">Need a person?</h2><p>Get help with an account, a product issue, accessibility, or a privacy request.</p></div>
        <Link href="/support" className={styles.primaryLink}>Contact support <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
    </main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@type": "FAQPage", "@id": "https://syncedin.org/faq#page", url: "https://syncedin.org/faq",
      dateModified: PRODUCT_FAQ_REVIEWED_AT,
      mainEntity: PRODUCT_FAQS.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
    }).replace(/</g, "\\u003c") }} />
  </div>;
}
