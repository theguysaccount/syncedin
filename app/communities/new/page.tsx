import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createCommunity } from "./actions";
import { RoomImageUploads } from "../../conferences/RoomImageUploads";
import { NetworkDensity } from "../NetworkDensity";
import { AppShell } from "../../AppShell";
import { BrandScrapeFields } from "../../conferences/BrandScrapeFields";

export default async function NewCommunityPage() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/communities/new");

  // Pull the user's existing communities so we can list them at the
  // bottom of this page. Jack: "I previously set up a community
  // ('DNA Roundtable'). However, when I'm on my communities page, I
  // don't actually see that link at the bottom of that page of the
  // community already made." There's no /communities index route —
  // this page IS that surface. Filter is `kind='community'` because
  // conferences + communities share the same table.
  const service = createServiceClient();
  const { data: mineRaw } = await service
    .from("conferences")
    .select("slug, name, description, city, created_at, logo_url, brand_color")
    .eq("owner_user_id", user.id)
    .eq("kind", "community")
    .order("created_at", { ascending: false });
  const myCommunities = (mineRaw ?? []) as Array<{
    slug: string;
    name: string;
    description: string | null;
    city: string | null;
    created_at: string;
    logo_url: string | null;
    brand_color: string | null;
  }>;

  return (
    <AppShell>
      {/* MANIFESTO — shrunk so the NetworkDensity animation lands
          above-the-fold. Jack: "we can make this element a bit smaller
          so that that whole part is viewable without scrolling." */}
      {/* Side-by-side hero on desktop (Jack: 'this animated part can
          really be shrunk down, and text can go to the left of it')
          — text takes left half, NetworkDensity animation shrinks into
          the right half. Stacks on mobile so neither gets squashed. */}
      <section className="mt-2 grid lg:grid-cols-[5fr_4fr] gap-6 items-center">
        <div>
          <div className="retro-label">sync a community</div>
          <h1 className="retro-h1 text-2xl sm:text-3xl mt-2 leading-tight">
            Increase the network density of your community.
          </h1>
          <p
            className="mt-2 text-sm sm:text-base leading-relaxed"
            style={{ color: "var(--text-dim)" }}
          >
            The single biggest predictor of a community compounding into
            deals, jobs, and projects is the density of real connections
            between members. SyncedIn raises that automatically — every
            member onboards a twin, every twin talks to every other twin
            in parallel, and the win-wins surface as a ranked feed.
          </p>
        </div>

        <div>
          <NetworkDensity
            slowLabel="Today · speed of human bandwidth"
            fastLabel="On SyncedIn · speed of light"
            slowCaption="Members trickle through one DM, one event, one intro at a time."
            fastCaption="Twins talk in parallel 24/7. Density compounds with every new member."
            tagline={
              <>
                Density compounds,{" "}
                <span style={{ color: "var(--amber-bright)" }}>
                  forever
                </span>
                .
              </>
            }
          />
        </div>
      </section>

      <section className="mt-10 grid sm:grid-cols-3 gap-5">
        <Pillar
          k="01"
          t="One private community link"
          d="Members join through your shareable URL. Only people inside it see each other in discovery."
        />
        <Pillar
          k="02"
          t="Twins run the cold-start"
          d="N² introductions happen silently. Members see a ranked shortlist of who they should actually talk to."
        />
        <Pillar
          k="03"
          t="Density compounds"
          d="Every new member adds N new potential pairings. The community becomes more useful with each signup, not less."
        />
      </section>

      {/* YOUR COMMUNITIES — existing rows pulled above. Renders only
          when the user has created at least one. Goes BEFORE the form
          so returning creators don't scroll past the create CTA looking
          for their own work. */}
      {myCommunities.length > 0 && (
        <section className="mt-16">
          <div className="retro-label">your communities</div>
          <h2 className="retro-h1 text-2xl mt-2">
            Already spinning {myCommunities.length === 1
              ? "one community"
              : `${myCommunities.length} communities`}
            .
          </h2>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--text-dim)" }}
          >
            Click into any to copy the share link, view density stats,
            or manage members.
          </p>
          <div
            className="mt-5"
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12
            }}
          >
            {myCommunities.map((c) => (
              <Link
                key={c.slug}
                href={`/communities/${c.slug}`}
                className="retro-panel retro-panel-hover"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 14,
                  textDecoration: "none",
                  color: "inherit"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0
                  }}
                >
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      width={32}
                      height={32}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        objectFit: "cover",
                        flexShrink: 0,
                        background: c.brand_color ?? "var(--panel-2)"
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        flexShrink: 0,
                        background:
                          c.brand_color ??
                          "linear-gradient(135deg, #2358ff 0%, #6b2dc9 100%)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 14
                      }}
                    >
                      {c.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      className="retro-dim"
                      style={{
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      syncedin.org/communities/{c.slug}
                    </div>
                  </div>
                </div>
                {(c.description || c.city) && (
                  <div
                    className="retro-dim"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.45,
                      // Truncate to 2 visual lines so cards stay
                      // uniform height in the grid.
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden"
                    }}
                  >
                    {c.description ?? c.city}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FORM */}
      <section className="mt-16">
        <div className="retro-label">create your community</div>
        <h2 className="retro-h1 text-2xl mt-2">
          {myCommunities.length > 0
            ? "Spin up another community."
            : "Spin up your community link."}
        </h2>
        <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Get a private space at syncedin.org/communities/your-slug. Members
          join through that link and only see fellow members. Owner tools
          include bulk invite, QR code, and live density stats.
        </p>

        <form action={createCommunity} className="mt-6 space-y-4">
          {/* Brand-scrape: paste a URL → auto-fill name + description +
              logo + brand color. #156. */}
          <BrandScrapeFields />
          <label className="block">
            <div className="text-sm font-semibold">Community name</div>
            <input
              name="name"
              required
              placeholder="Founders' Roundtable"
              className="retro-input mt-1"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold">URL slug</div>
            <div className="flex items-center gap-1 mt-1">
              <span className="retro-dim text-xs">
                syncedin.org/communities/
              </span>
              <input
                name="slug"
                required
                pattern="[a-z0-9-]+"
                placeholder="founders-roundtable"
                className="retro-input flex-1"
              />
            </div>
          </label>
          <label className="block">
            <div className="text-sm font-semibold">
              One-line description (optional)
            </div>
            <input
              name="description"
              placeholder="A private network of operators in vertical SaaS."
              className="retro-input mt-1"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold">City / region (optional)</div>
            <input
              name="city"
              placeholder="San Francisco, CA · global"
              className="retro-input mt-1"
            />
          </label>
          <RoomImageUploads />
          <button type="submit" className="retro-btn retro-btn-primary mt-2">
            + Create community
          </button>
        </form>
      </section>
    </AppShell>
  );
}

function Pillar({ k, t, d }: { k: string; t: string; d: string }) {
  return (
    <div className="retro-panel" style={{ padding: "20px 22px" }}>
      <div className="retro-amber text-xs font-bold">{k}</div>
      <div className="mt-2 font-semibold text-sm">{t}</div>
      <div
        className="mt-2 retro-dim text-xs"
        style={{ lineHeight: 1.6 }}
      >
        {d}
      </div>
    </div>
  );
}
