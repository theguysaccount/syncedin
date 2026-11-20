import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { withPublicSEO } from "@/lib/public-seo";
import { NETWORKING_GUIDES } from "@/lib/networking-guides";
import { GuideNavigation } from "./GuideLayout";
import styles from "./guides.module.css";

export const metadata: Metadata = withPublicSEO("/guides", {
  title: "Networking guides: notes, introductions, goals, and AI twins",
  description: "Practical SyncedIn guides for connection notes, warm introductions, conversation goals, thoughtful follow-ups, and human-reviewed AI networking.",
  openGraph: { type: "website" },
});

export default function GuidesPage() {
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.hub} id="main-content">
      <header className={styles.hubHeader}><h1>Networking guides</h1><p className={styles.introduction}>Better conversations start with better context. Practical guides from SyncedIn for writing an honest opener, making a useful next step, and keeping your judgment in the loop.</p></header>
      <div className={styles.guideList}>
        {NETWORKING_GUIDES.map((guide, index) => <article key={guide.slug}><Link href={`/guides/${guide.slug}`}>
          <img src={`/guides/${guide.slug}/opengraph-image.png`} alt={guide.imageAlt} width={1200} height={630} loading={index < 2 ? "eager" : "lazy"} decoding="async" />
          <div className={styles.meta}><span>{guide.topic}</span><span>{guide.readTime}</span></div>
          <h2>{guide.title}</h2><p>{guide.description}</p><span className={styles.readGuide}>Read guide <ArrowRight size={17} aria-hidden="true" /></span>
        </Link></article>)}
      </div>
      <section className={styles.nextStep}><div><h2>Already know who you want to reach?</h2><p>A SyncedIn twin can help explore the context behind an introduction. You review the conversation and choose the real next step.</p></div><Link href="/login" className={styles.primaryLink}>Create your twin <ArrowRight size={18} aria-hidden="true" /></Link></section>
    </main>
  </div>;
}
