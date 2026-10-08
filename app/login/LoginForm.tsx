"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowRight, Bot, LoaderCircle } from "lucide-react";
import { login, signInWithPassword, signUpWithPassword } from "./actions";
import { OAuthButtons } from "./OAuthButtons";
function Submit({ signup }: { signup: boolean }) {
  const { pending } = useFormStatus();
  return <button className="retro-btn retro-btn-primary w-full" disabled={pending}>{pending ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowRight size={17} aria-hidden="true" />}{pending ? "Please wait..." : signup ? "Create account" : "Sign in"}</button>;
}
export function LoginForm({ invite, conference, next, chatgptEnabled=false, initialError, sent, exists }: {
  invite?: string; conference?: string; next?:string; chatgptEnabled?:boolean; initialError: string; sent: boolean; exists: boolean;
}) {
  const [signup, setSignup] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => { setNative(Capacitor.isNativePlatform()); }, []);
  return <>
    <Link href="/agents" className="retro-btn w-full mb-4"><Bot size={18} aria-hidden="true" /> Set up with my agent <ArrowRight size={16} aria-hidden="true" /></Link>
    <div className="auth-mode" aria-label="Account access">
      <button type="button" aria-pressed={!signup} onClick={() => setSignup(false)}>Sign in</button>
      <button type="button" aria-pressed={signup} onClick={() => setSignup(true)}>Create account</button>
    </div>
    <form action={signup ? signUpWithPassword : signInWithPassword}>
      <input type="hidden" name="invite" value={invite ?? ""} /><input type="hidden" name="conference" value={conference ?? ""} />
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="native_app" value={native ? "yes" : "no"} />
      <div><label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="retro-input" /></div>
      {signup && <div><label htmlFor="auth-phone">Phone number{native ? " (optional)" : ""}</label><input id="auth-phone" name="phone_number" type="tel" required={!native} autoComplete="tel" placeholder="+1 555 123 4567" className="retro-input" /><p className="retro-dim text-xs mt-2">Private. Messaging preferences are yours to choose.</p></div>}
      <div><label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" required minLength={signup ? 8 : undefined} autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 8 characters" : "Your password"} className="retro-input" /></div>
      <label className="terms-check"><input type="checkbox" name="accepted_terms" value="yes" required checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>. Objectionable content and abusive behavior are not tolerated.</span></label>
      {signup && <label className="terms-check"><input type="checkbox" name="messaging_opt_in" value="yes" /><span>Send connection and message updates to my phone. Optional. Message and data rates may apply. Reply STOP to opt out.</span></label>}
      {initialError && <div className="auth-error" role="alert">{initialError}</div>}
      <Submit signup={signup} />
    </form>
    {(sent || exists) && <p className="auth-message" role="status">{exists ? "Check your inbox for a sign-in link, or use your password above." : "Check your inbox to confirm your email or sign in."}</p>}
    <OAuthButtons invite={invite} conference={conference} next={next} chatgptEnabled={chatgptEnabled} acceptedTerms={accepted} />
    {!native && <details className="mt-5 text-sm retro-dim"><summary className="cursor-pointer">Sign in without a password</summary>
      <form action={login} className="mt-4">
        <input type="hidden" name="invite" value={invite ?? ""} /><input type="hidden" name="conference" value={conference ?? ""} />
        <input type="hidden" name="next" value={next ?? ""} />
        <input type="hidden" name="accepted_terms" value={accepted ? "yes" : ""} />
        <label htmlFor="magic-email">Email address</label><input id="magic-email" type="email" name="email" required autoComplete="email" className="retro-input" />
        <button className="retro-btn" disabled={!accepted}>Email sign-in link</button>
      </form>
    </details>}
  </>;
}
