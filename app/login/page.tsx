import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authDestination } from "@/lib/auth-return";
import { LoginForm } from "./LoginForm";
import { ThemeSync } from "../ThemeSync";
export default async function LoginPage({ searchParams }: { searchParams: { sent?: string; error?: string; detail?: string; invite?: string; conference?: string; exists?: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (user) redirect(authDestination({ invite: searchParams.invite, conference: searchParams.conference }));
  return <main className="auth-screen"><ThemeSync /><div className="auth-content">
    <Link href="/" aria-label="SyncedIn home"><img src="/syncedin-wordmark-tight.png" className="wordmark-themed" alt="SyncedIn" style={{ width: 145, height: 35, objectFit: "contain" }} /></Link>
    <h1>Your next connection<br />starts here.</h1><p>Welcome to your network.</p>
    <LoginForm invite={searchParams.invite} conference={searchParams.conference} initialError={searchParams.detail || (searchParams.error ? "We couldn't sign you in. Please try again." : "")} sent={searchParams.sent === "1"} exists={searchParams.exists === "1"} />
    <nav className="auth-footer" aria-label="Legal and support"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link><a href="mailto:hi@syncedin.org">Contact</a></nav>
  </div></main>;
}
