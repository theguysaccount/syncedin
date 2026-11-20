import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { withPublicSEO } from "@/lib/public-seo";
import { LAUNCH_ARTICLE as article } from "@/lib/launch-article";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/article", {
  title: article.title,
  description: article.description,
  openGraph: { type: "article", modifiedTime: article.reviewedAt },
});

export default function LaunchArticlePage() {
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <Link href="/blog" className={styles.backLink}><ArrowLeft size={15} aria-hidden="true" /> All writing</Link>
      <article>
        <header className={styles.header}>
          <div className={styles.meta}><span>Product thinking</span><span>From the SyncedIn team</span></div>
          <h1>{article.title}</h1>
          <p className={styles.introduction}>{article.description}</p>
          <p className={styles.byline}>By <Link href="/about">SyncedIn</Link> <span aria-hidden="true">/</span> Reviewed <time dateTime={article.reviewedAt}>November 20, 2026</time></p>
        </header>
        <div className={styles.body}>
          <p className={styles.disclosure}>{article.disclosure}</p>
          {article.introduction.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          <figure className={styles.articleImage}><img src="/article/opengraph-image.png" alt="SyncedIn's product approach: selected context, an editable conversation, and a human decision." width={1200} height={630} /></figure>
          {article.sections.map(section => <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id}>{section.heading}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.steps.length > 0 && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
          </section>)}
          <section className={styles.sourceList} aria-labelledby="article-sources">
            <h2 id="article-sources">Sources and next steps</h2>
            <p>The product descriptions above are our own, not an independent benchmark. These pages explain the current workflows and relevant limits.</p>
            <ul>{article.links.map(link => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul>
            <p><a href="/article.md"><FileText size={16} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />Plain-text article</a></p>
          </section>
        </div>
      </article>
      <aside className={styles.nextStep} aria-labelledby="article-next-step">
        <div><p className={styles.label}>Try the workflow</p><h2 id="article-next-step">Start with the context you choose.</h2><p>Build a twin, inspect the draft, and decide what is worth taking into a real conversation.</p></div>
        <Link href="/login" className={styles.primaryLink}>Create my twin <ArrowRight size={18} aria-hidden="true" /></Link>
      </aside>
      <p className={styles.byline}>For press, partnership, or platform inquiries, <a href="https://calendly.com/JackJay" target="_blank" rel="noopener noreferrer">contact the founder</a>. For product help, visit <Link href="/support">support</Link>.</p>
    </main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@graph": [
        { "@type": "Article", "@id": "https://syncedin.org/article#article", headline: article.title, description: article.description,
          dateModified: article.reviewedAt, author: { "@type": "Organization", name: "SyncedIn", url: "https://syncedin.org/about" },
          publisher: { "@id": "https://syncedin.org/#organization" }, image: "https://syncedin.org/article/opengraph-image.png", mainEntityOfPage: "https://syncedin.org/article", inLanguage: "en" },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "SyncedIn", item: "https://syncedin.org" },
          { "@type": "ListItem", position: 2, name: "Journal", item: "https://syncedin.org/blog" },
          { "@type": "ListItem", position: 3, name: article.title, item: "https://syncedin.org/article" },
        ] },
      ],
    }).replace(/</g, "\\u003c") }} />
  </div>;
}
