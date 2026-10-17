import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Wordmark } from "../../../Wordmark";
import { updateConference, deleteConference } from "./actions";
import { BrandScrapeFields } from "../../BrandScrapeFields";

export default async function EditConferencePage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const slug = (params.slug || "").toLowerCase();
  if (!slug) notFound();

  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/conferences/${slug}/edit`);

  const service = createServiceClient();
  const { data: conf } = await service
    .from("conferences")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!conf) notFound();
  if (conf.owner_user_id !== user.id) {
    redirect(`/conferences/${slug}?error=not_owner`);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 pt-4 pb-8">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link
          href={`/conferences/${slug}`}
          className="retro-dim text-xs"
        >
          back to {conf.name} &gt;
        </Link>
      </div>

      <h1 className="retro-h1 text-3xl mt-8">Edit {conf.name}</h1>
      <p className="retro-dim text-sm mt-2">
        The slug is permanent (it&apos;s the shareable URL). Everything else
        is editable.
      </p>

      <form action={updateConference} className="mt-8 space-y-4">
        <input type="hidden" name="slug" value={slug} />
        {/* #156 — brand-scrape: paste website URL to refresh logo / color /
            description. Pre-populated from current saved values. */}
        <BrandScrapeFields
          defaultUrl={conf.website_url ?? ""}
          defaultLogoUrl={conf.logo_url ?? ""}
          defaultBrandColor={conf.brand_color ?? ""}
          defaultOgImageUrl={
            (conf.brand_meta as any)?.og_image_url ?? ""
          }
        />
        <label className="block">
          <div className="text-sm font-semibold">Conference name</div>
          <input
            name="name"
            required
            defaultValue={conf.name}
            className="retro-input mt-1"
          />
        </label>
        <label className="block">
          <div className="text-sm font-semibold">Description</div>
          <textarea
            name="description"
            defaultValue={conf.description ?? ""}
            rows={3}
            className="retro-input mt-1"
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm font-semibold">Starts</div>
            <input
              name="starts_at"
              type="date"
              defaultValue={conf.starts_at ?? ""}
              className="retro-input mt-1"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold">Ends</div>
            <input
              name="ends_at"
              type="date"
              defaultValue={conf.ends_at ?? ""}
              className="retro-input mt-1"
            />
          </label>
        </div>
        <label className="block">
          <div className="text-sm font-semibold">City</div>
          <input
            name="city"
            defaultValue={conf.city ?? ""}
            className="retro-input mt-1"
          />
        </label>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="retro-btn retro-btn-primary">
            Save changes
          </button>
          <Link
            href={`/conferences/${slug}`}
            className="retro-btn"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Danger zone */}
      <div
        className="mt-12 retro-panel p-4"
        style={{ borderColor: "var(--red)" }}
      >
        <div
          className="retro-label"
          style={{ color: "var(--red)" }}
        >
          danger zone
        </div>
        <p className="text-sm mt-2">
          Deleting a conference removes all membership entries and the
          shareable URL. Conversations between members keep working — they
          just lose the conference context.
        </p>
        <form action={deleteConference} className="mt-3">
          <input type="hidden" name="slug" value={slug} />
          <button
            type="submit"
            className="retro-btn text-sm"
            style={{
              borderColor: "var(--red)",
              color: "var(--red)"
            }}
          >
            Delete {conf.name}
          </button>
        </form>
      </div>
    </main>
  );
}
