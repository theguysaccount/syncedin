import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authDestination } from "@/lib/auth-return";
import { LoginForm } from "./LoginForm";
import { ThemeSync } from "../ThemeSync";
import { BrandMark } from "../BrandMark";
import { chatgptSignInEnabled } from "@/lib/chatgpt-sign-in";
export default async function LoginPage({ searchParams }: { searchParams: { sent?: string; error?: string; detail?: string; invite?: string; conference?: string; exists?: string; next?: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (user) redirect(authDestination({ invite: searchParams.invite, conference: searchParams.conference, next:searchParams.next }));
  const chatgptEnabled=await chatgptSignInEnabled();
  return <main className="auth-screen"><ThemeSync /><div className="auth-content">
    <Link href="/" className="app-brand-link" aria-label="SyncedIn home"><BrandMark /></Link>
    <h1>Your next connection<br />starts here.</h1><p>Welcome to your network.</p>
    <LoginForm invite={searchParams.invite} conference={searchParams.conference} next={searchParams.next} chatgptEnabled={chatgptEnabled} initialError={searchParams.detail || (searchParams.error ? "We couldn't sign you in. Please try again." : "")} sent={searchParams.sent === "1"} exists={searchParams.exists === "1"} />
    <nav className="auth-footer" aria-label="Legal and support"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link><a href="mailto:hi@syncedin.org">Contact</a></nav>
  </div></main>;
}
