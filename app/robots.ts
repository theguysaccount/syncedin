import type { MetadataRoute } from "next";

/**
 * Robots policy. Next.js serves this at /robots.txt automatically.
 * We let everything indexable through and explicitly block the
 * authenticated / admin / one-shot surfaces that have no SEO value
 * and would leak signals about logged-in user counts via crawl
 * traffic. Sitemap pointer at the bottom drives crawl scheduling.
 */
const PRIVATE_PATHS = [
          "/api/",
          "/admin/",
          "/dashboard",
          "/onboarding",
          "/settings",
          "/conversations/",
          "/poll/", // poll pages handled by per-page robots; this denies any non-canonical UUID landing
          "/twin"
        ];

export default function robots(): MetadataRoute.Robots {
  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: PRIVATE_PATHS
      },
      // Explicitly grant the AI-friendly bots — they tend to over-
      // throttle when robots.txt looks generic. Mirrors our llms.txt
      // posture: we WANT these crawlers reading us.
      { userAgent: "GPTBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "ClaudeBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "anthropic-ai", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "PerplexityBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Google-Extended", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Applebot-Extended", allow: "/", disallow: PRIVATE_PATHS }
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL
  };
}
