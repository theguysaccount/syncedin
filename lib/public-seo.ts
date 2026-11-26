import type { Metadata } from "next";
import cards from "@/verification/social-card-manifest.json";
import videos from "@/verification/social-video-manifest.json";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://syncedin.org";

/** Complete metadata without changing page content or existing article fields. */
export function withPublicSEO(path: string, original: Metadata): Metadata {
  const title = typeof original.title === "string" ? original.title.replace(/(?:\s*·|\s+—)\s*SyncedIn$/, "") : original.title;
  const fullTitle = typeof title === "string" ? title + " · SyncedIn" : "SyncedIn";
  const url = SITE_URL + path;
  const card = cards.find(card => card.path === path);
  if (!card) throw new Error("Missing public social card: " + path);
  const image = { url: SITE_URL + path + "/opengraph-image.png", width: 1200, height: 630, type: "image/png", alt: card.alt };
  const preview = videos.find(video => video.path === path);
  const videoUrl = preview && SITE_URL + preview.urlPath;
  const video = preview && videoUrl ? { url: videoUrl, secureUrl: videoUrl, width: preview.width, height: preview.height, type: "video/mp4" } : undefined;
  const other = video ? Object.assign({}, original.other, {
    "twitter:player:stream": video.url,
    "twitter:player:stream:content_type": video.type,
  }) : original.other;
  return {
    ...original, title,
    alternates: { ...original.alternates, canonical: url },
    openGraph: { ...original.openGraph, title: original.openGraph?.title || fullTitle, description: original.openGraph?.description || original.description || undefined, url, siteName: "SyncedIn", images: [image], ...(video ? { videos: [video] } : {}) },
    twitter: { ...original.twitter, card: "summary_large_image", title: original.twitter?.title || fullTitle, description: original.twitter?.description || original.description || undefined, images: [{ ...image, url: SITE_URL + path + "/twitter-image.png" }] },
    other,
  };
}

/** Standalone chat entry keeps its own self-referencing canonical and approved homepage animation. */
export function withHomeVariantSEO(original: Metadata, path = "/talk"): Metadata {
  const url = SITE_URL + path;
  const title = typeof original.title === "string" ? original.title + " · SyncedIn" : "SyncedIn";
  const image = { url: SITE_URL + "/social/syncedin-preview.gif", width: 600, height: 338, alt: "Your twin reaching the entire network at once", type: "image/gif" };
  return { ...original, alternates: { ...original.alternates, canonical: url },
    openGraph: { ...original.openGraph, type: "website", siteName: "SyncedIn", title, description: original.description || undefined, url, images: [image] },
    twitter: { ...original.twitter, card: "summary_large_image", title, description: original.description || undefined, images: [image] } };
}
