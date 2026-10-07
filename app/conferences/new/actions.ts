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

export async function createConference(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conferences/new");

  const name = String(formData.get("name") ?? "").trim();
  let slug = slugify(String(formData.get("slug") ?? "").trim());
  if (!name) redirect("/conferences/new?error=missing_name");
  if (!slug) slug = slugify(name);
  if (!slug) redirect("/conferences/new?error=bad_slug");
  const safety = await contentSafetyResponse(`${name}\n${String(formData.get("description") ?? "")}`, user.id);
  if (safety) redirect("/conferences/new?error=content_check");

  const service = createServiceClient();

  // Ensure uniqueness with a short random suffix on collision.
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

  // Brand-scrape (optional) — these fields come from the BrandScrapeFields
  // client component which auto-fetches /api/scrape-room-brand. Empty
  // string → null so we never insert empty rows.
  const website_url =
    String(formData.get("website_url") ?? "").trim() || null;
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
    starts_at: String(formData.get("starts_at") ?? "").trim() || null,
    ends_at: String(formData.get("ends_at") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    website_url,
    logo_url,
    cover_url,
    brand_color,
    brand_meta: og_image_url ? { og_image_url } : null
  };

  let { error: insErr } = await service.from("conferences").insert(row);
  if (insErr && /column .* does not exist/i.test(insErr.message)) {
    const { cover_url: _c, brand_meta: _b, website_url: _w, ...minimal } = row;
    insErr = (await service.from("conferences").insert(minimal)).error;
  }
  if (insErr) {
    console.error("[conferences/new] insert failed", insErr);
    redirect("/conferences/new?error=create_failed");
  }

  // Owner is automatically a member.
  await service
    .from("conference_members")
    .insert({ conference_slug: slug, user_id: user.id });

  redirect(`/conferences/${slug}?created=1`);
}
