import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "../BrandMark";
import { ThemeSync } from "../ThemeSync";
import { AgentSetup } from "./AgentSetup";
import { AgentAccess } from "./AgentAccess";
import { withPublicSEO } from "@/lib/public-seo";
export const metadata: Metadata = withPublicSEO("/agents", {
  title: "Join SyncedIn with your agent",
  description:
    "Let your agent prepare your SyncedIn profile. Review what you share, build your twin, and grant expiring access to find matches and draft introductions.",
});
export default async function AgentsPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return (
    <main className="app-frame agent-page agent-signup-page">
      <ThemeSync />
      <header className="agent-page-nav">
        <Link href="/" aria-label="SyncedIn home">
          <BrandMark />
        </Link>
        <Link className="retro-btn" href={user ? "/onboarding" : "/login"}>
          {user ? "My twin" : "Sign in"}
        </Link>
      </header>
      <div className="agent-page-content">
        <header className="page-heading agent-heading">
          <div>
            <h1>SyncedIn, with your agent.</h1>
            <p>ChatGPT. Claude. Codex. Your context, your approval.</p>
          </div>
        </header>
        <AgentSetup />
        {user && <AgentAccess />}
        <nav className="agent-links">
          <a href="/join.md">Agent protocol</a>
          <a href="/syncedin.mjs">Terminal client</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
    </main>
  );
}
