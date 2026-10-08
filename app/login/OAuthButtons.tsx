"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { authDestination } from "@/lib/auth-return";
import type { Provider } from "@supabase/supabase-js";
import { MessageCircle } from "lucide-react";

// Google "G" logo — official multi-color inline SVG.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.836.86-3.048.86-2.345 0-4.328-1.584-5.036-3.71H.957v2.332A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC04"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9.005 9.005 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 7.29C4.672 5.164 6.655 3.58 9 3.58z"
      />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 14 17" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.624 8.954c-.022-2.45 1.998-3.629 2.087-3.687-1.135-1.658-2.9-1.884-3.527-1.909-1.499-.151-2.928.882-3.687.882-.762 0-1.94-.86-3.19-.836C1.674 3.427.183 4.354-.633 5.804c-1.668 2.895-.427 7.183 1.198 9.526.79 1.146 1.74 2.434 2.99 2.388 1.196-.047 1.65-.778 3.097-.778 1.448 0 1.858.778 3.123.755 1.286-.024 2.108-1.169 2.898-2.314.913-1.327 1.288-2.606 1.31-2.674-.029-.012-2.515-.969-2.541-3.84zM9.297 1.918c.66-.804 1.108-1.917.985-3.027-.953.04-2.107.637-2.79 1.44-.61.71-1.144 1.844-1.001 2.932 1.061.082 2.146-.541 2.806-1.345z"
      />
    </svg>
  );
}

/**
 * Client-side OAuth init.
 *
 * Why client-side: Supabase auth PKCE flow stores a code verifier that the
 * /auth/callback handler reads when exchanging the code for a session. The
 * verifier MUST live in document.cookie (set by @supabase/ssr's
 * createBrowserClient) for the callback to find it. The earlier
 * implementation was a server action — Next 14 server actions can write
 * cookies but the redirect-to-Google response often doesn't flush them
 * in a way the subsequent callback request can read, producing the
 * "PKCE code verifier not found in storage" error.
 *
 * Running signInWithOAuth on the client guarantees the verifier lands in
 * document.cookie before the navigation to Google, surviving the round
 * trip back through /auth/callback.
 */
export function OAuthButtons({
  invite,
  conference,
  next,
  chatgptEnabled=false,
  acceptedTerms = false
}: {
  invite?: string;
  conference?: string;
  next?: string;
  chatgptEnabled?: boolean;
  acceptedTerms?: boolean;
}) {
  const [busy, setBusy] = useState<"google" | "apple" | "custom:chatgpt" | null>(null);
  const [err, setErr] = useState<string>("");
  const [web, setWeb] = useState(false);
  useEffect(() => { setWeb(!Capacitor.isNativePlatform()); }, []);

  function callbackUrl(): string {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams();
    params.set("next", authDestination({ invite, conference, next }));
    const qs = params.toString();
    return `${origin}/auth/callback${qs ? `?${qs}` : ""}`;
  }

  async function go(provider: "google" | "apple" | "custom:chatgpt") {
    if (!acceptedTerms || Capacitor.isNativePlatform()) return;
    setErr("");
    setBusy(provider);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as Provider,
        options: { redirectTo: callbackUrl(), ...(provider === "custom:chatgpt" ? { scopes: "openid profile email" } : {}) }
      });
      if (error || !data?.url) {
        throw new Error(error?.message || `${provider} sign-in failed`);
      }
      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed");
      setBusy(null);
    }
  }

  if (!web) return null;
  return (
    <div className="space-y-2"><div className="auth-divider">or</div>
      {chatgptEnabled && <button type="button" onClick={()=>go("custom:chatgpt")} disabled={busy!==null||!acceptedTerms} className="retro-btn w-full"><MessageCircle size={18} aria-hidden="true" />{busy==="custom:chatgpt"?"Connecting...":"Continue with ChatGPT"}</button>}
      <button
        type="button"
        onClick={() => go("google")}
        disabled={busy !== null || !acceptedTerms}
        className="retro-btn retro-btn-primary w-full flex items-center justify-center gap-3"
        style={{ background: "#ffffff", color: "#16182a", border: "1px solid var(--border-bright)", boxShadow: "0 6px 18px -8px rgba(0,0,0,0.18)" }}
      >
        <GoogleLogo />
        <span>{busy === "google" ? "Connecting…" : "Continue with Google"}</span>
      </button>
      {/*
        Apple sign-in is hidden until the provider is configured in
        Supabase (Authentication → Providers → Apple → needs Service ID,
        Key ID, Team ID, .p8 key from the Apple Developer Program).
        Without that config Supabase returns 400 "provider is not
        enabled" the moment a user taps it, which looks like a broken
        app. Flip APPLE_OAUTH_ENABLED to true here once the provider is
        live in Supabase.
      */}
      {false && (
        <button
          type="button"
          onClick={() => go("apple")}
          disabled={busy !== null}
          className="retro-btn w-full flex items-center justify-center gap-3"
        >
          <AppleLogo />
          <span>{busy === "apple" ? "Connecting…" : "Continue with Apple"}</span>
        </button>
      )}
      {err && (
        <div
          className="text-xs"
          style={{
            color: "#ef4444",
            marginTop: 8,
            wordBreak: "break-word"
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
