import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { withPublicSEO } from "@/lib/public-seo";
import { GuideNavigation } from "../../guides/GuideLayout";
import styles from "../../guides/guides.module.css";
import { LinkmeImporter } from "./LinkmeImporter";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/for/linkme", {
  title: "Link.me profile import for a SyncedIn twin",
  description: "Read available public information from your Link.me or Linktree profile, review the imported name, bio, and links, then continue to SyncedIn setup with the context you choose.",
});

export default function LinkmeLandingPage() {
  return <div className={styles.page}>
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <header className={styles.header}>
        <div className={styles.meta}><span>Bring your public profile</span></div>
        <h1>Link.me profile import</h1>
        <p className={styles.introduction}>Start from a public page you own. Review the name, bio, image, and links we can read, then use that context to continue building your SyncedIn twin.</p>
      </header>
      <section className={styles.toolSection} aria-label="Import your public link profile"><LinkmeImporter /></section>
      <div className={`${styles.body} ${styles.funnelInfo}`}>
        <h2>Import what is available, then check it</h2>
        <p>The importer reads public Link.me and Linktree profile pages. Results depend on the page's accessible content and may be incomplete. Link categories are inferred from their labels and URLs, not verified statements about what you offer.</p>
        <h2>Continue with the context you choose</h2>
        <p>The imported preview is saved in this browser's session storage for the signup handoff. Signing in continues to onboarding so you can review your information. A profile import does not create a paid inbox, guarantee that a twin speaks exactly like you, or establish an endorsement from another service.</p>
        <p>Using a professional summary instead? Try a <Link href="/generate-free-portfolio">portfolio preview</Link>. Already working with an agent? Use <Link href="/agents">private-draft setup</Link>. See the <Link href="/faq">FAQ</Link> and <Link href="/privacy">privacy policy</Link> for current product and data-handling details.</p>
      </div>
    </main>
  </div>;
}
