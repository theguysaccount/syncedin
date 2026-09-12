/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app uses native images; do not expose the unused image optimizer.
  images: { unoptimized: true },
  // Internal rewrites — keep the URL the user sees, but serve the
  // existing route's component. Communities and conferences share the
  // same Supabase table (kind='community' vs 'conference'), so the
  // /communities/[slug] route reuses the /conferences/[slug] page.
  // The page itself reads `kind` from the row and picks the right
  // URL prefix for share/edit/join links.
  async rewrites() {
    return [
      { source: "/communities/:slug", destination: "/conferences/:slug" },
      {
        source: "/communities/:slug/join",
        destination: "/conferences/:slug/join"
      },
      {
        source: "/communities/:slug/edit",
        destination: "/conferences/:slug/edit"
      }
    ];
  },
  // Friendly redirects for press-style URLs people guess at — the
  // canonical launch article lives at /article, but /press, /launch,
  // /story, /blog, and the original /articles/syncedin-launch.md path
  // should all land there too.
  async redirects() {
    return [
      { source: "/press", destination: "/article", permanent: false },
      { source: "/launch", destination: "/article", permanent: false },
      { source: "/story", destination: "/article", permanent: false },
      // /blog now has its own real index page — do NOT redirect.
      { source: "/articles", destination: "/blog", permanent: false },
      { source: "/articles/syncedin-launch", destination: "/article", permanent: true },
      { source: "/articles/syncedin-launch.md", destination: "/article", permanent: true }
    ];
  },
  env: {
    // Mirror Vercel's build-time system env vars into the client bundle.
    // Without this Next 14's client components see `undefined` for
    // process.env.VERCEL_GIT_COMMIT_SHA and the Footer falls back to
    // "dev" forever — so users had no way to tell which build was live.
    // Inlined here as a compile-time constant baked into the JS bundle.
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA || "",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_DATE:
      process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || ""
  }
};
module.exports = nextConfig;
