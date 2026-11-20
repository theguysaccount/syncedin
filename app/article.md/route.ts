import { launchArticleMarkdown } from "@/lib/launch-article";

export const dynamic = "force-static";

export function GET() {
  return new Response(launchArticleMarkdown(), { headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "X-Robots-Tag": "noindex, follow",
    Link: '<https://syncedin.org/article>; rel="canonical"',
    "X-Content-Type-Options": "nosniff",
  } });
}
