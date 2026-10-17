import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../../AppShell";
import { ClientDate } from "../../ClientDate";
import { OverrideRow } from "./OverrideRow";
import { ReSynthesizeButton } from "./ReSynthesizeButton";
import { PollMissingTwinsButton } from "./PollMissingTwinsButton";
import { startConversationByUserId } from "../../conversations/new/actions";
import { SocialIconRow } from "../../SocialIconRow";
import { socialsFromBlob } from "@/lib/social-from-blob";

export const dynamic = "force-dynamic";

/**
 * SEO-friendly slug helper — converts the poll question into a
 * kebab-case URL fragment, capped at 60 chars. The full slug pattern
 * is `${slug}-${shortId}` where shortId is the first 8 chars of the
 * UUID, so we get both human-readable + collision-proof URLs.
 *   "What's your deepest secret?" → "whats-your-deepest-secret"
 */
function questionToSlug(q: string): string {
  return (q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "poll");
}

/**
 * generateMetadata — gives every poll page its own title + description
 * + OG card derived from the actual poll question and a snippet of the
 * synthesis. This is the SEO unlock: Google indexes "[question] —
 * SyncedIn" instead of every poll page having identical metadata.
 */
export async function generateMetadata(
  props: {
    params: Promise<{ id: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  try {
    const service = createServiceClient();
    // Slug-aware lookup — same logic as the page component.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let lookupId = params.id;
    if (!UUID_RE.test(params.id)) {
      const m = params.id.match(/-([0-9a-f]{8})$/i);
      const shortId = m ? m[1].toLowerCase() : null;
      if (shortId) {
        // `id` is a uuid column; Postgres ilike doesn't work on uuid, so
        // match the 8-char prefix in JS over the small set of poll ids.
        const { data: ids } = await service.from("polls").select("id");
        const hit = ((ids ?? []) as Array<{ id: string }>).find((r) =>
          (r.id || "").toLowerCase().startsWith(shortId)
        );
        if (hit) lookupId = hit.id;
      }
    }
    const { data } = await service
      .from("polls")
      .select("id, question, synthesis_one_liner, synthesis")
      .eq("id", lookupId)
      .maybeSingle();
    const p = data as {
      id?: string;
      question?: string;
      synthesis_one_liner?: string | null;
      synthesis?: string | null;
    } | null;
    if (!p) {
      return {
        title: "Poll — SyncedIn",
        description: "Ask a question; get every twin's honest answer."
      };
    }
    const question = (p.question ?? "Poll").trim();
    const description =
      (p.synthesis_one_liner ?? "").trim() ||
      (p.synthesis ?? "").trim().slice(0, 160) ||
      `See how the SyncedIn network answered: "${question}".`;
    const canonical = `/poll/${questionToSlug(question)}-${params.id.slice(0, 8)}`;
    return {
      title: `${question} — SyncedIn poll`,
      description,
      alternates: { canonical },
      openGraph: {
        title: question,
        description,
        type: "article",
        siteName: "SyncedIn",
        url: canonical
      },
      twitter: {
        card: "summary_large_image",
        title: question,
        description
      },
      robots: { index: true, follow: true }
    };
  } catch {
    return {
      title: "Poll — SyncedIn",
      description: "Ask a question; get every twin's honest answer."
    };
  }
}

type PollRow = {
  id: string;
  question: string;
  context: string | null;
  status: string;
  synthesis: string | null;
  synthesis_one_liner: string | null;
  responses_count: number;
  overrides_count: number;
  created_at: string;
  synthesized_at: string | null;
  created_by: string;
};

type ResponseRow = {
  id: string;
  poll_id: string;
  twin_user_id: string;
  twin_response: string;
  human_override: string | null;
  was_overridden: boolean;
  generated_at: string;
  overridden_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  handle?: string | null;
  // Jack: "on this page where we're showing the twins' answers, we
  // might as well display information about that person and those
  // links to them and make their profile button clickable." Extended
  // with bio + city + social URLs so each row carries the same info
  // the dashboard cards already do.
  bio?: string | null;
  city?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
};

export default async function PollDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/poll/${params.id}`);

  const service = createServiceClient();

  // Slug routing — accept both bare UUIDs AND slug-suffixed URLs of
  // the form `${question-kebab}-${first-8-chars-of-uuid}`. We extract
  // the trailing 8-char fragment, find the poll whose UUID starts
  // with it, then serve. This lets us rank on Google for the actual
  // question wording while keeping URLs unique.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let lookupId = params.id;
  if (!UUID_RE.test(params.id)) {
    // Slug path — pull the last 8 hex chars after the final dash. `id` is a
    // uuid column and Postgres ilike doesn't work on uuid (it errored → null
    // → every poll 404'd), so match the prefix in JS over the small poll set.
    const m = params.id.match(/-([0-9a-f]{8})$/i);
    const shortId = m ? m[1].toLowerCase() : null;
    if (!shortId) notFound();
    const { data: ids } = await service.from("polls").select("id");
    const hit = ((ids ?? []) as Array<{ id: string }>).find((r) =>
      (r.id || "").toLowerCase().startsWith(shortId)
    );
    if (hit) {
      lookupId = hit.id;
    } else {
      notFound();
    }
  }

  const { data: poll } = await service
    .from("polls")
    .select("*")
    .eq("id", lookupId)
    .maybeSingle();
  if (!poll) notFound();
  const p = poll as PollRow;

  // Canonical URL — if user landed via bare UUID, push them to the
  // pretty slug for SEO + share clarity. 307 keeps it cheap.
  const canonicalSlug = `${questionToSlug(p.question)}-${p.id.slice(0, 8)}`;
  if (params.id === p.id) {
    redirect(`/poll/${canonicalSlug}`);
  }

  const { data: responsesData } = await service
    .from("poll_responses")
    .select(
      "id, poll_id, twin_user_id, twin_response, human_override, was_overridden, generated_at, overridden_at"
    )
    .eq("poll_id", lookupId);
  const responses = (responsesData ?? []) as ResponseRow[];

  const userIds = responses.map((r) => r.twin_user_id);
  // Pull the full profile shape (social URLs + bio + city) so each
  // poll row can render the same context the dashboard cards do.
  // Falls back to the lean shape if any column is missing on this DB.
  let profilesData: ProfileRow[] = [];
  if (userIds.length) {
    try {
      const { data } = await service
        .from("profiles")
        .select(
          "id, display_name, email, avatar_url, handle, bio, city, linkedin_url, x_url, instagram_url, facebook_url, website_url"
        )
        .in("id", userIds);
      profilesData = (data ?? []) as ProfileRow[];
    } catch {
      const { data } = await service
        .from("profiles")
        .select("id, display_name, email, avatar_url, handle")
        .in("id", userIds);
      profilesData = (data ?? []) as ProfileRow[];
    }
  }
  const profiles = profilesData.reduce<Record<string, ProfileRow>>(
    (acc, pr) => {
      acc[pr.id] = pr;
      return acc;
    },
    {}
  );

  // BACKFILL FROM auth.users — some responder twin_user_ids don't have
  // a profiles row (signup edge case, deleted profile, or the response
  // predates profile-row creation). Without this, those names fall all
  // the way through to "User abcd" which looks like a ghost network.
  // service.auth.admin.getUserById hits auth.users directly + returns
  // email + raw_user_meta_data (full_name from Google OAuth). Wrap in
  // try so a 404 on any single id doesn't tank the whole page.
  const missingIds = userIds.filter((id) => id && !profiles[id]);
  if (missingIds.length) {
    await Promise.all(
      missingIds.map(async (id) => {
        try {
          const { data: authData } =
            await service.auth.admin.getUserById(id);
          const u = authData?.user as any;
          if (!u) return;
          const meta = (u.user_metadata ?? u.raw_user_meta_data ?? {}) as any;
          profiles[id] = {
            id,
            display_name:
              (meta.full_name as string | undefined) ||
              (meta.name as string | undefined) ||
              null,
            email: (u.email as string | undefined) ?? null,
            avatar_url:
              (meta.avatar_url as string | undefined) ||
              (meta.picture as string | undefined) ||
              null,
            handle: null
          };
        } catch {
          /* leave the id unresolved — falls back to short suffix */
        }
      })
    );
  }

  // Also pull each twin's ai_export_blob so socialsFromBlob can infer
  // LinkedIn / X / IG / FB URLs that the user added via Sources (which
  // land in the blob, not the explicit *_url columns). Mirrors the
  // pattern on proposals/page.tsx + dashboard cards.
  const twinByUserId = new Map<
    string,
    { ai_export_blob: string | null; goals: string | null; deal_preferences: string | null }
  >();
  if (userIds.length) {
    try {
      const { data: twins } = await service
        .from("twin_profiles")
        .select("user_id, ai_export_blob, goals, deal_preferences")
        .in("user_id", userIds);
      for (const t of ((twins ?? []) as any[])) {
        twinByUserId.set(t.user_id, {
          ai_export_blob: t.ai_export_blob ?? null,
          goals: t.goals ?? null,
          deal_preferences: t.deal_preferences ?? null
        });
      }
    } catch {
      /* silent — social icons fall back to explicit columns only */
    }
  }

  const myResponse = responses.find((r) => r.twin_user_id === user.id) ?? null;
  const networkResponses = responses
    .filter((r) => r.twin_user_id !== user.id)
    .sort((a, b) =>
      a.was_overridden === b.was_overridden ? 0 : a.was_overridden ? -1 : 1
    );

  // Count twins on the platform who have NOT yet answered this poll —
  // these are the ones the retroactive "poll new twins" button will pick
  // up. Same signal filter as /api/polls/create (goals or ai_export_blob
  // long enough to give a real answer).
  const answeredIds = new Set(responses.map((r) => r.twin_user_id));
  const { data: allTwins } = await service
    .from("twin_profiles")
    .select("user_id, goals, ai_export_blob")
    .limit(400);
  const eligibleTwins = ((allTwins as any[]) ?? []).filter(
    (t) =>
      (t.goals && t.goals.trim().length > 5) ||
      (t.ai_export_blob && t.ai_export_blob.trim().length > 40)
  );
  const missingTwinsCount = eligibleTwins.filter(
    (t) => !answeredIds.has(t.user_id)
  ).length;

  return (
    <AppShell>
      <section className="mt-4">
        <Link
          href="/poll"
          className="retro-dim text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          ← back to polls
        </Link>
        <div className="retro-label mt-3">poll · {p.status}</div>
        <h1 className="retro-h1 text-3xl sm:text-4xl mt-2 leading-tight">
          {p.question}
        </h1>
        {p.context && (
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--text-dim)", maxWidth: 720 }}
          >
            {p.context}
          </p>
        )}
        <div
          className="mt-3 text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          {p.responses_count} twin responses
          {p.overrides_count > 0
            ? ` · ${p.overrides_count} human-corrected`
            : ""}{" "}
          · created <ClientDate value={p.created_at} />
        </div>
      </section>

      {/* SYNTHESIS */}
      <section
        className="mt-8 retro-panel"
        style={{
          padding: 24,
          borderColor: "var(--amber)",
          background:
            "radial-gradient(800px 500px at 50% 0%, rgba(255,184,77,0.06), transparent 60%), var(--panel-solid)"
        }}
      >
        <div
          className="retro-label"
          style={{ color: "var(--amber-bright)" }}
        >
          network synthesis
        </div>
        {p.status === "running" ? (
          <div
            className="mt-3 text-base"
            style={{ color: "var(--text-dim)" }}
          >
            Synthesizing… every twin is answering in parallel. This page will
            update once the synthesis is ready.
          </div>
        ) : (
          <>
            {p.synthesis_one_liner && (
              <h2
                className="retro-h1 text-2xl mt-2"
                style={{ lineHeight: 1.35 }}
              >
                → {p.synthesis_one_liner}
              </h2>
            )}
            {p.synthesis && (
              <p
                className="mt-4 text-base leading-relaxed"
                style={{ color: "var(--text)", maxWidth: 760 }}
              >
                {p.synthesis}
              </p>
            )}
            <ReSynthesizeButton pollId={p.id} />
            <PollMissingTwinsButton
              pollId={p.id}
              pendingCount={missingTwinsCount}
            />
          </>
        )}
      </section>

      {/* YOUR TWIN — override surface */}
      {myResponse && (
        <section className="mt-10">
          <div className="retro-label">your twin&apos;s answer</div>
          <h2 className="retro-h1 text-2xl mt-2">
            How you came across in this poll.
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-dim)", maxWidth: 720 }}
          >
            This is what the network heard from you. If it&apos;s not
            actually what you&apos;d say, edit it. Your correction carries
            extra weight in the re-synthesis and trains the platform&apos;s
            sense of you.
          </p>
          <div className="mt-4">
            <OverrideRow response={myResponse} pollId={p.id} isSelf={true} />
          </div>
        </section>
      )}

      {/* NETWORK — every other twin */}
      <section className="mt-12 mb-8">
        <div className="retro-label">every twin&apos;s answer</div>
        <h2 className="retro-h1 text-2xl mt-2">
          What the rest of the network said.
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-dim)" }}
        >
          {networkResponses.length} responses · human-corrected ones rise to
          the top.
        </p>
        <ul className="mt-5 space-y-3">
          {networkResponses.map((r) => {
            const pr = profiles[r.twin_user_id];
            // Name resolution: prefer display_name → @handle → email
            // prefix → short user-id suffix. "Someone" is the absolute
            // last resort because EVERY card showing "Someone" tanks
            // perceived legitimacy of the platform.
            const handleStr = (pr as any)?.handle as string | undefined;
            const emailPrefix = (pr?.email as string | undefined)?.split(
              "@"
            )[0];
            const name =
              (pr?.display_name as string | undefined) ||
              (handleStr ? `@${handleStr}` : undefined) ||
              emailPrefix ||
              (r.twin_user_id
                ? `User ${r.twin_user_id.slice(0, 4)}`
                : "Someone");
            return (
              <li
                key={r.id}
                className="retro-panel"
                style={{
                  padding: 16,
                  borderColor: r.was_overridden
                    ? "var(--amber)"
                    : "var(--border)",
                  // Clip any rogue children so the card cannot overflow
                  // its column on narrow viewports.
                  maxWidth: "100%",
                  overflow: "hidden",
                  boxSizing: "border-box"
                }}
              >
                {/* Name + avatar are now a Link to the responder's
                    portfolio (if they have a handle — most users do).
                    Connect button on the right spawns a conversation
                    via the same server action /conversations/new
                    uses. Jack: "lets make the profiles clickable to
                    connect or drop into messages." */}
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={
                      (pr as any)?.handle
                        ? `/u/${(pr as any).handle}`
                        : `/u/${name
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-+|-+$/g, "")}`
                    }
                    className="flex items-center gap-3 group"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textDecoration: "none",
                      color: "inherit"
                    }}
                    aria-label={`View ${name}'s portfolio`}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--panel-2)",
                        border: "1px solid var(--border-bright)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text)",
                        backgroundImage: pr?.avatar_url
                          ? `url(${pr.avatar_url})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        flexShrink: 0,
                        transition: "transform 0.15s ease"
                      }}
                      className="group-hover:scale-105"
                    >
                      {pr?.avatar_url ? "" : name.slice(0, 1).toUpperCase()}
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                        flex: 1
                      }}
                    >
                      <div
                        className="font-semibold text-sm"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap"
                        }}
                      >
                        <span className="group-hover:underline">{name}</span>
                        {/* Social icons — LinkedIn / X / IG / FB / web.
                            Inferred from explicit columns + the
                            ai_export_blob fallback so users who only
                            added socials via Sources still light up. */}
                        <SocialIconRow
                          urls={
                            pr
                              ? socialsFromBlob(
                                  pr,
                                  twinByUserId.get(r.twin_user_id)
                                )
                              : null
                          }
                          size={13}
                        />
                        {r.was_overridden && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--amber-bright)" }}
                          >
                            ✓ human-corrected
                          </span>
                        )}
                      </div>
                      {/* One-line context — bio fallback to city.
                          Jack: "we might as well display information
                          about that person." */}
                      {(pr?.bio || pr?.city) && (
                        <div
                          className="retro-dim text-xs"
                          style={{
                            marginTop: 2,
                            lineHeight: 1.4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical"
                          }}
                        >
                          {pr.bio ?? pr.city}
                        </div>
                      )}
                    </div>
                  </Link>
                  {/* Connect — server action drops you into the
                      conversation with this person (creates one if
                      none exists). Hidden when it'd be a self-link. */}
                  {r.twin_user_id && r.twin_user_id !== user.id && (
                    <form action={startConversationByUserId}>
                      <input
                        type="hidden"
                        name="user_id"
                        value={r.twin_user_id}
                      />
                      <button
                        type="submit"
                        className="retro-btn retro-btn-primary text-xs"
                        style={{
                          padding: "6px 12px",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          flexShrink: 0
                        }}
                        title={`Start a conversation with ${name}`}
                      >
                        💬 connect
                      </button>
                    </form>
                  )}
                </div>
                <div
                  className="mt-2 text-sm"
                  style={{
                    color: "var(--text)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    // Was overflowing the card on the right edge for
                    // any long word / URL / no-space sequence — force
                    // wrap so the text always stays inside the panel.
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    maxWidth: "100%"
                  }}
                >
                  {r.was_overridden && r.human_override
                    ? r.human_override
                    : r.twin_response}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
