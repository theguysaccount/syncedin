import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";
import {
  observationSnippet as _observationSnippet,
  buildInviteCopy as _buildInviteCopy
} from "@/lib/invite-copy";
import { proxiedAvatar } from "@/lib/avatar";

export const runtime = "nodejs"; // service client needs node runtime
export const alt = "Your twin started a conversation on SyncedIn";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RESERVED = new Set([
  "api",
  "auth",
  "dashboard",
  "onboarding",
  "login",
  "conversations",
  "privacy",
  "terms"
]);

function shortName(title: string): string {
  return (
    title?.split(/[-|,(·]/)[0]?.trim() ||
    "you"
  );
}

/**
 * Pull the most specific observation snippet out of the personalized
 * landing-page opener so the OG card can read like a real cold reach:
 *   "Jackson saw your founding engineer work on WorkableCafes.com..."
 * instead of the generic "I'm Jackson — my twin already drafted an opener
 * for yours."
 *
 * Heuristic:
 *   1. Drop a leading "Hey {name} — {sender} here." greeting if present.
 *   2. Take the first remaining sentence.
 *   3. Normalize first-person voice into third-person noun-phrase form
 *      ("Your founding engineer work caught my eye" → "your founding
 *      engineer work").
 *   4. Truncate at a word boundary around 110 chars.
 *   5. Strip trailing punctuation so the template can chain into ", and..."
 */
// Re-export the shared helpers from lib/invite-copy so the OG card and
// the landing-page animated hero never drift. The previous local copies
// of observationSnippet + buildInviteCopy lived here and the same logic
// was duplicated on the landing page — caused the "Stay" vs "Let's stay"
// mismatch Jack flagged. Now: one source of truth.
const observationSnippet = _observationSnippet;
const buildInviteCopy = _buildInviteCopy;

export default async function InviteOgImage({
  params
}: {
  params: { slug: string };
}) {
  const slug = (params.slug || "").toLowerCase();
  const SITE_URL =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://syncedin.org";

  // If reserved or no record, fall back to the site-wide image-y layout.
  let inviterName = "Your twin";
  let personName = "you";
  let recipientAvatar: string | null = null;
  let inviterAvatar: string | null = null;
  let starter: string = "";
  if (!RESERVED.has(slug)) {
    try {
      const service = createServiceClient();
      const { data: invite } = await service
        .from("pending_invites")
        .select(
          "inviter_user_id, person_title, recipient_avatar_url, conversation_starter, outbound_message"
        )
        .eq("slug", slug)
        .maybeSingle();
      if (invite) {
        personName = shortName(invite.person_title ?? "you");
        recipientAvatar =
          (invite as any).recipient_avatar_url || null;
        // Prefer the long landing-page message (scrape-driven Claude prose)
        // over the short templated outbound DM for the snippet source.
        starter =
          ((invite as any).conversation_starter as string) ||
          ((invite as any).outbound_message as string) ||
          "";
        const { data: inviter } = await service
          .from("profiles")
          .select("display_name, email, avatar_url")
          .eq("id", invite.inviter_user_id)
          .maybeSingle();
        inviterName =
          inviter?.display_name ||
          inviter?.email?.split("@")[0] ||
          "Their twin";
        inviterAvatar = (inviter as any)?.avatar_url || null;
      }
    } catch {
      /* fall through with defaults */
    }
  }

  const snippet = observationSnippet(starter);
  const copy = buildInviteCopy({
    inviterFullName: inviterName,
    recipientShortName: personName,
    snippet
  });
  // Initials fallback for when the LinkedIn scrape didn't surface a photo.
  // Two letters from the person_title so the card always renders a face-
  // shaped placeholder rather than a blank gap.
  const initials =
    personName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() ?? "")
      .join("") || "??";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          fontFamily: "Inter, system-ui, sans-serif"
        }}
      >
        {/* Custom branded background Jack designed (public/synced-background.png).
            The "Synced In" wordmark + bot logo are baked into the art, so we
            no longer paint a CSS wordmark — we only overlay personalization
            (the recipient's face) + the invite copy. */}
        <img
          src={`${SITE_URL}/synced-background.png`}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover"
          }}
        />

        {/* TOP ROW — recipient avatar pushed right. Wordmark is in the art. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            width: "100%"
          }}
        >
          {/* Scraped photos (media.licdn.com etc.) 403 on a cross-origin
              fetch, so Satori rendered an empty circle. Proxying through
              our own origin makes the fetch succeed; if it still fails the
              proxy serves a placeholder rather than nothing. */}
          {recipientAvatar ? (
            <img
              src={proxiedAvatar(recipientAvatar, SITE_URL) ?? recipientAvatar}
              width={104}
              height={104}
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                border: "5px solid #ffffff",
                boxShadow: "0 12px 32px -10px rgba(58,77,255,0.5)",
                objectFit: "cover"
              }}
            />
          ) : (
            <div
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                border: "5px solid #ffffff",
                boxShadow: "0 12px 32px -10px rgba(58,77,255,0.5)",
                background: "linear-gradient(135deg, #1f8bff, #6b2dc9)",
                color: "#ffffff",
                fontSize: 40,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {initials}
            </div>
          )}
        </div>

        {/* HEADLINE + BODY — bottom-left over the lighter part of the art.
            A soft white scrim keeps the copy readable wherever the waves
            brighten or darken behind it. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            maxWidth: 820,
            background: "rgba(255,255,255,0.72)",
            borderRadius: 28,
            padding: "30px 36px",
            // Belt-and-braces: even if a future copy change runs long, clip
            // the box instead of letting text spill past the card edge (the
            // "cut off mid-sentence" render Jack caught).
            maxHeight: 400,
            overflow: "hidden"
          }}
        >
          <div
            style={{
              // "{name}, it's time to get SyncedIn" on the top line, then a
              // bigger, more readable teaser below. Jack: "put it all on that
              // top line so there's more space, and make the bottom text
              // bigger — it's hard to read."
              fontSize: 52,
              fontWeight: 800,
              color: "#1a1530",
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              display: "flex"
            }}
          >
            {copy.headline}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 40,
              fontWeight: 500,
              color: "#2a2150",
              lineHeight: 1.3,
              display: "flex"
            }}
          >
            {copy.body}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        // Apple's link preview service refuses to cache images served
        // with no-store / private headers. Without this header Vercel
        // applies a private-no-store default to dynamic routes and
        // iMessage falls back to the favicon.
        "cache-control":
          "public, immutable, no-transform, max-age=86400"
      }
    }
  );
}
