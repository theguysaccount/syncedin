import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Dynamic sitemap for SyncedIn. Next.js will hit this at /sitemap.xml
 * and serve the resulting XML, so we get a fully-dynamic surface map
 * without needing a CDN-cached static file.
 *
 * Coverage:
 *   - All static marketing routes (home, /article, /blog, /vs/*,
 *     vertical landing pages, /privacy, /terms, /support, /talk,
 *     /faq, /child-safety, /transformer, /wins, /for/linkme,
 *     /generate-free-portfolio)
 *   - All public /u/<handle> portfolio pages with a real handle set
 *     (we cap at 5000 to keep the response under the sitemap-protocol
 *     size limit; if we ever cross that we'll paginate via
 *     sitemap-index style)
 *
 * Excludes:
 *   - /dashboard, /onboarding, /conversations, /settings — gated routes
 *     that don't need search-index coverage and would leak signals
 *     about logged-in user counts via crawl traffic
 *   - /admin/* — gated to jacksonjezio@gmail.com only
 *   - /api/* — programmatic surfaces
 *   - /[slug] invite pages — per-recipient one-shots, not evergreen content
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  const staticRoutes: MetadataRoute.Sitemap = [
    // === Top-level marketing ===
    { url: `${APP_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${APP_URL}/article`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${APP_URL}/blog`, changeFrequency: "weekly", priority: 0.9 },

    // === Comparison pages (high-intent SEO) ===
    { url: `${APP_URL}/vs/lemlist`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${APP_URL}/vs/clay`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${APP_URL}/vs/linkedin-dms`, changeFrequency: "monthly", priority: 0.8 },

    // === Vertical landing pages ===
    { url: `${APP_URL}/founders-vc`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${APP_URL}/founders-cofounder`, changeFrequency: "monthly", priority: 0.7 },

    // === Community-shaped surfaces ===
    { url: `${APP_URL}/hypernetwork`, changeFrequency: "weekly", priority: 0.7 },

    // === Open feedback board ===
    { url: `${APP_URL}/feedback`, changeFrequency: "daily", priority: 0.5 },

    // Existing public pages discovered outside the original sitemap.
    { url: `${APP_URL}/faq` },
    { url: `${APP_URL}/child-safety` },
    { url: `${APP_URL}/transformer` },
    { url: `${APP_URL}/wins` },
    { url: `${APP_URL}/talk` },
    { url: `${APP_URL}/for/linkme` },
    { url: `${APP_URL}/generate-free-portfolio` },
    { url: `${APP_URL}/ai-knows-me` },
    { url: `${APP_URL}/alternatives/linkedin` },
    { url: `${APP_URL}/paper` },

    // === Trust / legal ===
    { url: `${APP_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${APP_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${APP_URL}/support`, changeFrequency: "monthly", priority: 0.3 }
  ];

  // === Dynamic: public portfolio pages /u/<handle> ===
  // Each signup with a handle set becomes its own indexable surface.
  // Wrapped in try/catch so the sitemap never 500s if the DB is down
  // or the handle column hasn't been migrated yet — we degrade to the
  // static list rather than break the SEO surface entirely.
  let portfolioRoutes: MetadataRoute.Sitemap = [];
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("profiles")
      .select("handle, updated_at")
      .not("handle", "is", null)
      .limit(5000);
    if (Array.isArray(data)) {
      portfolioRoutes = data
        .filter((r: any) => typeof r.handle === "string" && r.handle.trim())
        .map((r: any) => ({
          url: `${APP_URL}/u/${r.handle}`,
          lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
          changeFrequency: "weekly" as const,
          priority: 0.6
        }));
    }
  } catch {
    /* DB unreachable — fall through to static-only sitemap */
  }

  return [...staticRoutes, ...portfolioRoutes];
}
