import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createConference } from "./actions";
import { AppShell } from "../../AppShell";
import { NetworkDensity } from "../../communities/NetworkDensity";
import { BrandScrapeFields } from "../BrandScrapeFields";
import { RoomImageUploads } from "../RoomImageUploads";

export default async function NewConferencePage() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conferences/new");

  return (
    <AppShell>
      {/* Side-by-side hero — text left, NetworkDensity right (Jack:
          'shrunk and text can go to the left of it') so neither dominates
          the viewport. Stacks on mobile. */}
      <section className="mt-2 grid lg:grid-cols-[5fr_4fr] gap-6 items-center">
        <div>
          <div className="retro-label">sync a conference</div>
          <h1 className="retro-h1 text-2xl sm:text-3xl mt-2 leading-tight">
            Build the strongest inner-network of your life.
          </h1>
          <p
            className="mt-2 text-sm sm:text-base leading-relaxed"
            style={{ color: "var(--text-dim)" }}
          >
            Conferences, cohorts, residencies are loose collections of
            brilliant people who mostly never talk to the right
            counterpart in the room. Every attendee builds a twin, every
            twin talks to every other twin in parallel, and each human
            walks in with a ranked shortlist of who to sit next to.
          </p>
        </div>

        <div>
          <NetworkDensity
            slowLabel="Today · walking & small talk"
            fastLabel="On SyncedIn · speed of light"
            slowCaption="One hallway conversation at a time."
            fastCaption="Twins find the high-leverage pairings before anyone arrives."
            tagline={
              <>
                Deeper connections,{" "}
                <span style={{ color: "var(--amber-bright)" }}>faster</span>.
              </>
            }
          />
        </div>
      </section>

      {/* Three concrete pillars */}
      <section className="mt-10 grid sm:grid-cols-3 gap-5">
        <Pillar
          k="01"
          t="Every attendee onboards a twin"
          d="A 5-minute self-portrait — goals, voice, deal preferences. Their clone is ready before the venue doors open."
        />
        <Pillar
          k="02"
          t="Twins meet in parallel"
          d="N² conversations run silently. The platform surfaces the matches your attendees would have spent the whole event hunting for."
        />
        <Pillar
          k="03"
          t="Humans only see what matters"
          d="A short list of pre-vetted win-wins per person. Hallway-track signal without the hallway-track tax."
        />
      </section>

      {/* FORM */}
      <section className="mt-16">
        <div className="retro-label">create your conference</div>
        <h2 className="retro-h1 text-2xl mt-2">
          Spin up your shareable link.
        </h2>
        <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Get a private community at syncedin.org/conferences/your-slug. Only
          people who join via that link see each other. Owner tools include
          bulk invite, QR code for in-person check-in, and live attendee stats.
        </p>

        <form action={createConference} className="mt-6 space-y-4">
          {/* Brand-scrape: paste a URL → auto-fill name + description +
              logo + brand color. #156. */}
          <BrandScrapeFields />
          <label className="block">
            <div className="text-sm font-semibold">Conference name</div>
            <input
              name="name"
              required
              placeholder="DevCon 2026"
              className="retro-input mt-1"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold">URL slug</div>
            <div className="flex items-center gap-1 mt-1">
              <span className="retro-dim text-xs">
                syncedin.org/conferences/
              </span>
              <input
                name="slug"
                required
                pattern="[a-z0-9-]+"
                placeholder="devcon-2026"
                className="retro-input flex-1"
              />
            </div>
            <p className="text-xs mt-1 retro-dim">
              Lowercase letters, digits, dashes. This becomes the shareable
              join link.
            </p>
          </label>
          <label className="block">
            <div className="text-sm font-semibold">
              One-line description (optional)
            </div>
            <input
              name="description"
              placeholder="The annual gathering of agentic-protocol builders."
              className="retro-input mt-1"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-sm font-semibold">Starts</div>
              <input
                name="starts_at"
                type="date"
                className="retro-input mt-1"
              />
            </label>
            <label className="block">
              <div className="text-sm font-semibold">Ends</div>
              <input
                name="ends_at"
                type="date"
                className="retro-input mt-1"
              />
            </label>
          </div>
          <label className="block">
            <div className="text-sm font-semibold">City (optional)</div>
            <input
              name="city"
              placeholder="San Francisco, CA"
              className="retro-input mt-1"
            />
          </label>
          <RoomImageUploads />
          <button type="submit" className="retro-btn retro-btn-primary mt-2">
            + Create conference
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

