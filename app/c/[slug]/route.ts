import { NextResponse } from "next/server";
import { resolveConversationBySlug } from "@/lib/conversationSlugServer";

/**
 * Short conversation slug resolver (#69).
 *
 * /c/jack-alex-7k4q9p → 302 /conversations/<uuid>
 *
 * Both participants see the same slug. Slugs are written at conversation
 * creation time + lazily on first read; this route is the public entry
 * point for sharing a "meaningful" conversation URL.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const url = new URL(req.url);
  const slug = (params.slug || "").toLowerCase();
  if (!slug) {
    return NextResponse.redirect(`${url.origin}/dashboard`);
  }
  const id = await resolveConversationBySlug(slug);
  if (!id) {
    return NextResponse.redirect(
      `${url.origin}/404?from=c&slug=${encodeURIComponent(slug)}`
    );
  }
  return NextResponse.redirect(`${url.origin}/conversations/${id}`);
}
