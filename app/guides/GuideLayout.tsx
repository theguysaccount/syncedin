import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { GUIDE_REVIEW_DATE, NETWORKING_GUIDES, type NetworkingGuide } from "@/lib/networking-guides";
import styles from "./guides.module.css";

export function GuideNavigation() {
  return (
    <nav className={styles.navigation} aria-label="SyncedIn guides navigation">
      <Link href="/" className={styles.brand} aria-label="SyncedIn home"><img src="/syncedin-wordmark-tight.png" alt="SyncedIn" width={180} height={44} className="wordmark-themed" /></Link>
      <div className={styles.navigationLinks}>
        <Link href="/guides"><BookOpen size={17} aria-hidden="true" /> Guides</Link>
        <Link href="/login" className={styles.primaryLink}>Create your twin <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </nav>
  );
}

export function GuideLayout({ guide, children }: { guide: NetworkingGuide; children: React.ReactNode }) {
  const path = `/guides/${guide.slug}`;
  const url = `https://syncedin.org${path}`;
  return (
    <div className={styles.page}>
      <GuideNavigation />
      <main className={styles.article} id="main-content">
        <Link href="/guides" className={styles.backLink}><ArrowLeft size={15} aria-hidden="true" /> All guides</Link>
        <header className={styles.header}>
          <div className={styles.meta}><span>{guide.topic}</span><span>{guide.readTime}</span></div>
          <h1>{guide.title}</h1>
          <p className={styles.introduction}>{guide.description}</p>
          <p className={styles.byline}>By SyncedIn <span aria-hidden="true">/</span> Reviewed <time dateTime={GUIDE_REVIEW_DATE}>November 19, 2026</time></p>
        </header>
        <div className={styles.body}>{children}</div>
        <aside className={styles.nextStep} aria-labelledby="next-step-heading">
          <div>
            <p className={styles.label}>The conversation after the opener</p>
            <h2 id="next-step-heading">Give the context somewhere to go.</h2>
            <p>Build a SyncedIn twin from the context you choose to share. Review the conversation and its proposed next step before acting on it.</p>
          </div>
          <Link href="/login" className={styles.primaryLink}>Create your twin <ArrowRight size={18} aria-hidden="true" /></Link>
        </aside>
        <section className={styles.related} aria-labelledby="related-guides-heading">
          <h2 id="related-guides-heading">Keep reading</h2>
          <div className={styles.relatedLinks}>
            {NETWORKING_GUIDES.filter(item => item.slug !== guide.slug).map(item => (
              <Link href={`/guides/${item.slug}`} key={item.slug}>{item.title}<ArrowRight size={18} aria-hidden="true" /></Link>
            ))}
          </div>
        </section>
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Article", "@id": `${url}#article`, headline: guide.title, description: guide.description,
            datePublished: GUIDE_REVIEW_DATE, dateModified: GUIDE_REVIEW_DATE,
            author: { "@type": "Organization", name: "SyncedIn", url: "https://syncedin.org" },
            publisher: { "@type": "Organization", name: "SyncedIn", url: "https://syncedin.org" },
            image: `${url}/opengraph-image.png`, mainEntityOfPage: url, inLanguage: "en" },
          { "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: "SyncedIn", item: "https://syncedin.org" },
            { "@type": "ListItem", position: 2, name: "Guides", item: "https://syncedin.org/guides" },
            { "@type": "ListItem", position: 3, name: guide.title, item: url },
          ] },
        ],
      }).replace(/</g, "\\u003c") }} />
    </div>
  );
}
