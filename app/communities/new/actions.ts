"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { contentSafetyResponse } from "@/lib/content-safety";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Create a community — shares the conferences table (kind='community').
 * Same membership + discovery mechanics as a conference; the only
 * differences are the landing copy + sidebar label + URL prefix.
 */
export async function createCommunity(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/communities/new");

  const name = String(formData.get("name") ?? "").trim();
  let slug = slugify(String(formData.get("slug") ?? "").trim());
  if (!name) redirect("/communities/new?error=missing_name");
  if (!slug) slug = slugify(name);
  if (!slug) redirect("/communities/new?error=bad_slug");
  const safety = await contentSafetyResponse(`${name}\n${String(formData.get("description") ?? "")}`, user.id);
  if (safety) redirect("/communities/new?error=content_check");

  const service = createServiceClient();

  // Slug collision protection — communities & conferences share namespace.
  let candidate = slug;
  for (let i = 0; i < 4; i++) {
    const { data: existing } = await service
      .from("conferences")
      .select("slug")
      .eq("slug", candidate)
      .maybeSingle();
    if (!existing) break;
    candidate = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  slug = candidate;

  // Brand-scrape fields (#156) — populated client-side by BrandScrapeFields.
  const website_url =
    String(formData.get("website_url") ?? "").trim() || null;
  // Prefer an explicitly uploaded profile photo over the brand-scraped
  // logo. cover_upload is the creator's banner (also the OG image).
  const logo_url =
    String(formData.get("logo_upload") ?? "").trim() ||
    String(formData.get("logo_url") ?? "").trim() ||
    null;
  const cover_url = String(formData.get("cover_upload") ?? "").trim() || null;
  const brand_color =
    String(formData.get("brand_color") ?? "").trim() || null;
  const og_image_url =
    String(formData.get("og_image_url") ?? "").trim() || null;

  const row: Record<string, unknown> = {
    slug,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    owner_user_id: user.id,
    starts_at: null as string | null,
    ends_at: null as string | null,
    city: String(formData.get("city") ?? "").trim() || null,
    kind: "community" as const,
    website_url,
    logo_url,
    cover_url,
    brand_color,
    brand_meta: og_image_url ? { og_image_url } : null
  };

  let { error: insErr } = await service.from("conferences").insert(row);
  // If a column is missing on this DB, drop the optional ones and retry
  // so room creation never hard-fails on a schema gap.
  if (insErr && /column .* does not exist/i.test(insErr.message)) {
    const { cover_url: _c, brand_meta: _b, website_url: _w, ...minimal } = row;
    insErr = (await service.from("conferences").insert(minimal)).error;
  }
  if (insErr) {
    console.error("[communities/new] insert failed", insErr);
    redirect("/communities/new?error=create_failed");
  }

  // Owner is automatically a member.
  await service
    .from("conference_members")
    .insert({ conference_slug: slug, user_id: user.id });

  redirect(`/communities/${slug}?created=1`);
}
