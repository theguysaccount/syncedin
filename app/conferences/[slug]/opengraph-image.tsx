import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";

// Service client needs the node runtime.
export const runtime = "nodejs";
// Render per-request so a freshly-picked template (banner-only / clean
// card) shows immediately instead of serving a cached image. Jack: "when
// I click 'clean card' or 'banner only' it doesn't actually change."
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "Join this room on SyncedIn";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG/share image for community + conference pages. Uses the creator's
 * uploaded banner (conferences.cover_url) as the background, with the
 * room name + "Join · Sync with the network." overlaid. Jack: "that
 * banner can also become the meta image … put the name of their
 * community in that meta image, and it can say 'Join' and 'Sync with the
 * network.'"
 *
 * /communities/<slug> rewrites to /conferences/<slug>, so this single OG
 * route serves both URL shapes.
 */
export default async function OgImage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = ((await params).slug || "").toLowerCase();
  let name = "A SyncedIn room";
  let cover: string | null = null;
  let kind = "conference";
  let template = "";
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("conferences")
      .select("name, cover_url, kind, brand_meta")
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      name = (data.name as string) || name;
      cover = (data.cover_url as string | null) ?? null;
      kind = (data.kind as string) || "conference";
      template = String((data.brand_meta as any)?.og_template ?? "");
    }
  } catch {
    /* fall back to defaults */
  }

  const kindLabel = kind === "community" ? "Community" : "Conference";
  // Templates (Jack): "banner_text" overlays name+CTA on the banner;
  // "banner_clean" shows the banner with NO big overlay (for banners that
  // already have their own text); "card" ignores the banner and renders a
  // clean branded card. Default depends on whether a banner exists.
  const tpl =
    template === "banner_clean" || template === "card" || template === "banner_text"
      ? template
      : cover
      ? "banner_text"
      : "card";
  const useBanner = tpl !== "card" && !!cover;
  const showText = tpl !== "banner_clean";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#0b0f1e",
          fontFamily: "sans-serif"
        }}
      >
        {/* Banner background (skipped for the clean "card" template) */}
        {useBanner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover as string}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background:
                "linear-gradient(135deg, #1f59ff 0%, #6b2dc9 60%, #9333ea 100%)"
            }}
          />
        )}
        {/* Darkening overlay so text always reads on ANY banner — light
            or dark, busy or plain. Heavier at top (wordmark) and bottom
            (title) with a lighter middle so the image still shows. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: showText
              ? "linear-gradient(180deg, rgba(6,8,18,0.62) 0%, rgba(6,8,18,0.30) 38%, rgba(6,8,18,0.55) 70%, rgba(6,8,18,0.92) 100%)"
              : "linear-gradient(180deg, rgba(6,8,18,0.45) 0%, rgba(6,8,18,0) 26%)"
          }}
        />
        {/* Content */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 64,
            width: "100%",
            height: "100%"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              // In the clean (no-overlay) template, wrap the wordmark in a
              // readable chip so it sits cleanly over the host's own
              // banner text.
              ...(showText
                ? {}
                : {
                    alignSelf: "flex-start",
                    padding: "10px 16px",
                    borderRadius: 12,
                    background: "rgba(6,8,18,0.55)"
                  })
            }}
          >
            {/* Satori requires explicit display:flex on any element with
                more than one child — a div mixing the "Synced" text node
                with the <span>In</span> errored the whole image (the
                preview then fell back to the favicon). Two spans in a flex
                row is safe. */}
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: "-0.01em",
                textShadow: "0 2px 10px rgba(0,0,0,0.55)"
              }}
            >
              <span style={{ color: "#ffffff" }}>Synced</span>
              <span style={{ color: "#ffc94d" }}>In</span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 700,
                color: "rgba(255,255,255,0.8)",
                textTransform: "uppercase",
                letterSpacing: "0.16em"
              }}
            >
              · {kindLabel}
            </div>
          </div>

          {showText && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 800,
                  color: "#ffffff",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                  maxWidth: 1000,
                  display: "flex",
                  textShadow: "0 3px 18px rgba(0,0,0,0.65)"
                }}
              >
                {name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 30px",
                    borderRadius: 12,
                    background: "#ffffff",
                    color: "#0b0f1e",
                    fontSize: 30,
                    fontWeight: 800,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.35)"
                  }}
                >
                  Join →
                </div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: "#ffffff",
                    textShadow: "0 2px 12px rgba(0,0,0,0.7)"
                  }}
                >
                  Sync with the network.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
