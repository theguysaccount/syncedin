import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withPublicSEO } from "@/lib/public-seo";
import { TrackBeacon } from "../TrackBeacon";
import { GuideNavigation } from "../guides/GuideLayout";
import styles from "../guides/guides.module.css";
import { AiKnowsMeFunnel } from "./AiKnowsMeFunnel";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = withPublicSEO("/ai-knows-me", {
  title: "AI profile preview: use reviewed context from ChatGPT or Claude",
  description: "Prepare a shareable professional summary with your AI, review what it says, and preview a SyncedIn profile from the context you choose. No complete-history access.",
});

export default async function AiKnowsMePage(props: { searchParams?: Promise<{ preview?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !searchParams?.preview) redirect("/onboarding");

  return <div className={styles.page}>
    <TrackBeacon meta={{ door: "ai-knows-me" }} />
    <GuideNavigation />
    <main className={styles.article} id="main-content">
      <header className={styles.header}>
        <div className={styles.meta}><span>Your context, reviewed by you</span></div>
        <h1>AI profile preview</h1>
        <p className={styles.introduction}>Ask your AI for a shareable professional summary, or write one yourself. Choose what to include, correct the facts, and preview a profile from that context.</p>
      </header>
      <section className={styles.toolSection} aria-label="Prepare and preview your profile"><AiKnowsMeFunnel /></section>
      <div className={`${styles.body} ${styles.funnelInfo}`}>
        <h2>A summary, not a memory audit</h2>
        <p>An AI's answer depends on the context and features available to it. It may omit details, make mistakes, or infer things you did not mean. SyncedIn does not gain access to your ChatGPT or Claude account or complete conversation history through this preview.</p>
        <h2>Choose what belongs in a professional profile</h2>
        <p>Keep useful work, goals, interests, and what you can offer. Leave out credentials, raw private chats, and unnecessary information about other people. The generated headline, summary, and highlights are drafts to review, not verified facts about you.</p>
        <h2>Continue when the context feels right</h2>
        <p>The preview does not need an account. Signing up continues into onboarding with a local prefill from this browser. Review your profile and twin context there before sharing a public link.</p>
        <p>Prefer your agent to prepare a private draft for approval? Use <Link href="/agents">agent-assisted setup</Link>. For the next exchange, start with a <Link href="/guides/networking-goals">specific conversation goal</Link>. See <Link href="/privacy">how data is processed</Link> before sharing context.</p>
      </div>
    </main>
  </div>;
}
