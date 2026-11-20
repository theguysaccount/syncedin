import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { withPublicSEO } from "@/lib/public-seo";
import { LAUNCH_ARTICLE } from "@/lib/launch-article";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/blog", {
  title: "SyncedIn journal: product thinking and practical comparisons",
  description: "Writing from the SyncedIn team about context-led introductions, editable networking twins, and choosing the right outreach workflow.",
});

const JOURNAL_ENTRIES = [
  { href: "/article", title: LAUNCH_ARTICLE.title, excerpt: LAUNCH_ARTICLE.description, category: "Product thinking", reviewedAt: LAUNCH_ARTICLE.reviewedAt, imageAlt: "SyncedIn's approach: selected context, an editable conversation, and human choice." },
  { href: "/vs/lemlist", title: "SyncedIn vs lemlist: networking twins and outbound campaigns", excerpt: "Compare an AI-assisted outbound campaign workflow with a human-reviewed networking-twin conversation, including their different channels and limits.", category: "Comparison", reviewedAt: "2026-11-20", imageAlt: "SyncedIn and lemlist comparison: a relevant introduction, campaign operations, and human review." },
  { href: "/vs/clay", title: "SyncedIn vs Clay: networking conversations and GTM workflows", excerpt: "Clay's enrichment, research, and outbound workflows serve a different job from editable introduction conversations. Choose by the work you need done.", category: "Comparison", reviewedAt: "2026-11-20", imageAlt: "SyncedIn and Clay comparison: networking-twin conversations and data-driven GTM workflows." },
  { href: "/vs/linkedin-dms", title: "SyncedIn vs LinkedIn DMs: choosing the right first message", excerpt: "When a direct message is enough, when more context helps, and how a shareable twin-to-twin conversation differs from a connection note.", category: "Comparison", reviewedAt: "2026-11-19", imageAlt: "SyncedIn and LinkedIn DMs comparison: an honest opener, useful context, and the recipient's choice." },
] as const;

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function BlogIndexPage() {
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.hub} id="main-content">
      <header className={styles.hubHeader}>
        <div className={styles.meta}><span>From the SyncedIn team</span></div>
        <h1>SyncedIn journal</h1>
        <p className={styles.introduction}>The thinking behind the product, and practical comparisons for choosing how to start a useful conversation.</p>
        <p className={styles.byline}>Our own product perspectives, not independent reviews.</p>
        <Link href="/guides" className={styles.backLink}><BookOpen size={17} aria-hidden="true" /> Looking for connection notes or follow-up examples? Read the guides.</Link>
      </header>
      <section className={styles.guideList} aria-label="Journal articles and comparisons">
        {JOURNAL_ENTRIES.map((post, index) => <article key={post.href}>
          <Link href={post.href}>
            <img src={`${post.href}/opengraph-image.png`} alt={post.imageAlt} width={1200} height={630} loading={index < 2 ? "eager" : "lazy"} />
            <div className={styles.meta}><span>{post.category}</span><span>Reviewed <time dateTime={post.reviewedAt}>{formatDate(post.reviewedAt)}</time></span></div>
            <h2>{post.title}</h2>
            <p>{post.excerpt}</p>
            <span className={styles.readGuide}>Read the article <ArrowRight size={17} aria-hidden="true" /></span>
          </Link>
        </article>)}
      </section>
      <aside className={styles.nextStep} aria-labelledby="journal-next-step">
        <div><p className={styles.label}>A conversation with context</p><h2 id="journal-next-step">Explore the product for yourself.</h2><p>Choose what your twin should know, review its drafts, and decide what makes a worthwhile next step.</p></div>
        <Link href="/login" className={styles.primaryLink}>Create my twin <ArrowRight size={18} aria-hidden="true" /></Link>
      </aside>
    </main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@type": "CollectionPage", "@id": "https://syncedin.org/blog#journal",
      name: "SyncedIn journal", url: "https://syncedin.org/blog", publisher: { "@id": "https://syncedin.org/#organization" },
      mainEntity: { "@type": "ItemList", itemListElement: JOURNAL_ENTRIES.map((post, index) => ({ "@type": "ListItem", position: index + 1, name: post.title, url: `https://syncedin.org${post.href}` })) },
    }).replace(/</g, "\\u003c") }} />
  </div>;
}
