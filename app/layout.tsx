import "./globals.css";
import "./product.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Footer } from "./Footer";
import { ChunkErrorRecovery } from "./ChunkErrorRecovery";
import { ErrorAutoReport } from "./ErrorAutoReport";
import { FeedbackBubble } from "./FeedbackBubble";

// Microsoft Clarity — session-replay + heatmap analytics. Free, no PII
// collection by default, gives us watch-real-people-use-the-product
// recordings + click maps + rage-click detection. Insights we feed back
// into UX iterations.
//
// Activate by setting NEXT_PUBLIC_CLARITY_PROJECT_ID in the Vercel
// environment. Until then this is a no-op — nothing renders, no script
// loads. Set the env var via:
//   1. clarity.microsoft.com → New Project → SyncedIn (https://syncedin.org)
//   2. Copy the project ID (the string in the snippet's clarity("...") call)
//   3. Vercel → SyncedIn project → Settings → Env Vars → add
//      NEXT_PUBLIC_CLARITY_PROJECT_ID = <id> for Production + Preview
//   4. Redeploy
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://syncedin.org";
const SITE_TITLE =
  "SyncedIn | Where staying Synced to your network is seamless";
const SITE_DESCRIPTION =
  "SyncedIn is a digital-twin networking platform. Explore relevant introductions through editable AI conversations, review the context and proposed next step, and choose what happens next.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · SyncedIn"
  },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  // Favicon is auto-detected from app/icon.tsx (Edge ImageResponse
  // that renders the real SyncedIn hex+dots logo). Earlier attempt to
  // override with static /icons/icon-192.png was a mistake — those
  // PNGs are PWA install icons, NOT the SyncedIn logo. Reverted so
  // Next.js auto-discovery picks the real generated icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SyncedIn"
  },
  openGraph: {
    type: "website",
    siteName: "SyncedIn",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    // Explicit images list — takes precedence over the auto-routed
    // app/opengraph-image.tsx file convention. Jack uploaded a hero
    // video; we expose three derived assets:
    //
    //   1. /social/syncedin-preview.jpg (1200×630 still — letterboxed
    //      onto a dark navy bg). Universal fallback every platform
    //      uses (LinkedIn / WhatsApp / Slack / iMessage all show
    //      this).
    //   2. /social/syncedin-preview.gif (600px wide, 6s loop, 3.9 MB)
    //      — iMessage / Slack / Discord / Telegram / Twitter animate
    //      this in their preview cards. LinkedIn + WhatsApp do not
    //      (they show frame 1 as a static).
    //   3. /social/syncedin-preview-small.mp4 (1280×720, H.264, 2.7 MB,
    //      faststart) — used for og:video / twitter:player so the
    //      platforms that DO support inline video (Twitter player
    //      card, Discord) get the real animation.
    //
    // Order matters — first image is the canonical OG image. Some
    // crawlers only fetch images[0].
    images: [
      {
        url: "/social/syncedin-preview.gif",
        width: 600,
        height: 338,
        alt: "Your twin reaching the entire network at once",
        type: "image/gif"
      },
      {
        url: "/social/syncedin-preview.jpg",
        width: 1200,
        height: 630,
        alt: "Your twin reaching the entire network at once",
        type: "image/jpeg"
      }
    ],
    // og:video REMOVED — LinkedIn was promoting the page to "Video"
    // type when any og:video tag was present, then refusing to render
    // the GIF as og:image because video posts have stricter image
    // requirements. The MP4 still lives at /social/syncedin-preview-
    // small.mp4 for direct sharing; we just stop advertising it in
    // OG meta. Twitter player card removed for the same reason.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/social/syncedin-preview.jpg"]
  }
};

export const viewport: Viewport = {
  themeColor: "#080a12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* Apply the saved theme before paint so there's no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('syncedin-theme');if(t){document.documentElement.dataset.theme=t;}}catch(e){}"
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Describe the product without claiming a search or AI recommendation. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "@id": `${SITE_URL}/#application`,
              name: "SyncedIn",
              applicationCategory: "BusinessApplication",
              applicationSubCategory:
                "AI networking agent / digital twin platform",
              operatingSystem: "Web browser",
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
                description:
                  "The current web signup has no paid checkout. Future prices are not promised.",
              },
              creator: {
                "@type": "Organization",
                name: "Persist Ventures",
                url: "https://persist.org"
              },
              keywords: [
                "AI networking agent",
                "digital twin networking",
                "agent-to-agent protocol between humans",
                "AI clone for cold outreach",
                "automated warm intros",
                "AI alternative to LinkedIn",
                "personal networking agent",
                "AI for win-win matchmaking"
              ].join(", ")
            })
          }}
        />
        {/* Public site identity; discovery itself requires a signed-in account. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              name: "SyncedIn",
              alternateName: ["Synced In", "SyncedIn AI"],
              url: SITE_URL,
              publisher: { "@id": `${SITE_URL}/#organization` }
            })
          }}
        />
        {/* Organization identity, also described on the public About page. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "SyncedIn",
              alternateName: "Synced In",
              url: SITE_URL,
              logo: `${SITE_URL}/icons/icon-512.png`,
              description: SITE_DESCRIPTION,
              founder: {
                "@type": "Person",
                name: "Jackson Jesionowski"
              },
              sameAs: [
                "https://x.com/syncedinhq",
                "https://www.linkedin.com/company/syncedin",
                "https://www.instagram.com/syncedinhq",
                "https://www.youtube.com/@syncedin",
                "https://github.com/theguysaccount/syncedin",
                "https://persist.org"
              ]
            })
          }}
        />
        {/* These public destinations are also linked visibly in navigation. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "SyncedIn navigation",
              itemListElement: [
  {
    "@type": "SiteNavigationElement",
    "position": 1,
    "name": "Hypernetwork",
    "url": "https://syncedin.org/hypernetwork"
  },
  {
    "@type": "SiteNavigationElement",
    "position": 2,
    "name": "For Link.me creators",
    "url": "https://syncedin.org/for/linkme"
  },
  {
    "@type": "SiteNavigationElement",
    "position": 3,
    "name": "Networking guides",
    "url": "https://syncedin.org/guides"
  },
  {
    "@type": "SiteNavigationElement",
    "position": 4,
    "name": "About SyncedIn",
    "url": "https://syncedin.org/about"
  }
]
            })
          }}
        />
        <script defer src="https://rsio.org/vital.js"></script>
      </head>
      <body className="min-h-screen" data-clarity-mask="True">
        {/* Remove private review fragments before any telemetry loads. */}
        <Script id="private-agent-ticket" strategy="beforeInteractive" dangerouslySetInnerHTML={{__html:`if(location.pathname==='/agent/review'){var p=new URLSearchParams(location.search),t=new URLSearchParams(location.hash.slice(1)).get('ticket');if(t&&/^sir_[a-f0-9]{64}$/.test(t)){try{localStorage.setItem('syncedin-review-'+p.get('id'),JSON.stringify({ticket:t,expires:Date.now()+86400000}));history.replaceState(null,'',location.pathname+location.search);}catch{}}}`}} />
        {/* Catches ChunkLoadError on stale tabs that survived a deploy
            and forces a one-time hard reload so users never see the
            empty React-#418/#423 hydration error screen. */}
        <ChunkErrorRecovery />
        {/* Global auto-error reporter — every uncaught client-side
            error + unhandled promise rejection POSTs to /api/error-report
            so Jack sees broken states the moment they happen rather
            than discovering them from screenshots later. */}
        <ErrorAutoReport />
        {children}
        {/* Persistent "Give Feedback" launcher on every page — captures
            feedback with near-zero friction. Self-hides on the chat
            surfaces that pin a composer to the bottom. */}
        <FeedbackBubble />
        <Footer />
        {/* Microsoft Clarity — loads only when the env var is set, so
            local + preview branches without the key are unaffected.
            Strategy "afterInteractive" means the page is interactive
            first, the snippet loads in the background. */}
        {CLARITY_PROJECT_ID && (
          <Script
            id="ms-clarity"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){
        if(c.location.pathname.startsWith('/agent/'))return;
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`
            }}
          />
        )}
      </body>
    </html>
  );
}
