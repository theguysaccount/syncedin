import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { DmChat } from "./DmChat";

/**
 * Public DM surface — /dm/<handle> (#279).
 *
 * Link.me partnership entry point. A stranger arrives via a creator's
 * Link.me / linktree / IG bio, sees a clean mobile-first chat with the
 * creator's twin, asks questions, optionally pays to boost to top of
 * the creator's inbox.
 *
 * No auth required. The chat thread is identified by a visitor_token
 * stored in localStorage so the same visitor can return.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: {
    params: Promise<{ handle: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const service = createServiceClient();
  const { data: p } = await service
    .from("profiles")
    .select("display_name, email, avatar_url")
    .ilike("handle", params.handle)
    .maybeSingle();
  if (!p) return {};
  const name = (p as any).display_name || params.handle;
  const title = `Talk to ${name} · SyncedIn`;
  const desc = `${name}'s AI twin can answer your questions, route you to the right offer, or hand the message to the real ${name} for $X.`;
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      images: (p as any).avatar_url ? [(p as any).avatar_url] : []
    }
  };
}

export default async function DmPage(
  props: {
    params: Promise<{ handle: string }>;
  }
) {
  const params = await props.params;
  const handle = (params.handle || "").toLowerCase();
  if (!handle) notFound();
  const service = createServiceClient();
  const { data: creator } = await service
    .from("profiles")
    .select("id, display_name, email, avatar_url, handle")
    .ilike("handle", handle)
    .maybeSingle();
  if (!creator) notFound();

  const name =
    (creator as any).display_name ||
    ((creator as any).email as string)?.split("@")[0] ||
    handle;

  return (
    <DmChat
      creatorHandle={(creator as any).handle ?? handle}
      creatorName={name}
      creatorAvatarUrl={(creator as any).avatar_url ?? null}
    />
  );
}
