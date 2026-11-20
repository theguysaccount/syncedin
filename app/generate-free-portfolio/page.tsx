import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withPublicSEO } from "@/lib/public-seo";
import { TrackBeacon } from "../TrackBeacon";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";
import { GeneratePortfolioForm } from "./GeneratePortfolioForm";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/generate-free-portfolio", {
  title: "Free portfolio preview from your professional bio",
  description: "Turn a professional summary into a draft headline, about section, and highlights. Review the free preview, then sign up to continue building your SyncedIn portfolio.",
});

export default async function GenerateFreePortfolioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/onboarding");

  return <div className={styles.page}>
    <TrackBeacon meta={{ door: "generate-free-portfolio" }} />
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <header className={styles.header}>
        <div className={styles.meta}><span>Your work, in your words</span></div>
        <h1>Free portfolio preview</h1>
        <p className={styles.introduction}>Start with a professional bio or a summary you have reviewed. Generate a draft headline, about section, and highlights before deciding what to share.</p>
      </header>
      <section className={styles.toolSection} aria-label="Generate a portfolio preview"><GeneratePortfolioForm /></section>
      <div className={`${styles.body} ${styles.funnelInfo}`}>
        <h2>Lead with concrete, shareable work</h2>
        <p>Describe your role, what you are building, a few accurate examples, and what you want to explore next. Use names and numbers only when they are appropriate to share. An AI-generated draft can be wrong; check every claim before making it public.</p>
        <h2>A preview is not a published portfolio</h2>
        <p>This step generates a preview without an account. Continuing takes you to sign-in and onboarding, using a local prefill in this browser. Review your actual profile and public-link choices there.</p>
        <p>Need help choosing context? Use the <Link href="/ai-knows-me">AI profile-preview prompt</Link> or <Link href="/agents">prepare a private profile draft with your agent</Link>. Read the <Link href="/privacy">privacy policy</Link> before including private information.</p>
      </div>
    </main>
  </div>;
}
