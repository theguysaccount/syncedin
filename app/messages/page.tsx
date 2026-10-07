import Link from "next/link";
import { UserPlus } from "lucide-react";
import { hiddenUserIds } from "@/lib/user-safety";
import { ReportAccountButton } from "../ReportAccountButton";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ExcitementControl } from "../dashboard/ExcitementControl";
import { Avatar } from "../Avatar";
import { AppShell } from "../AppShell";
import { ClientDate } from "../ClientDate";
import { SocialIconRow } from "../SocialIconRow";
import { ConversationPrefetch } from "./ConversationPrefetch";
import { startConversationWithUser } from "../dashboard/actions";
import { computePairScore } from "@/lib/pair-score";
import { socialsFromBlob } from "@/lib/social-from-blob";
import { InlineActions } from "./InlineActions";
import { EditableOutcome } from "./EditableOutcome";

export const metadata = {
  title: "Messages · SyncedIn"
};

export default async function MessagesPage({
  searchParams
}: {
  searchParams?: { blocked?: string; owed?: string };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const hidden = await hiddenUserIds(user.id);

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, participant_a, participant_b, status, created_at, summary, counterpart_summary, excitement_score, excitement_locked"
    )
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const otherIds = (conversations ?? []).map((c) =>
    c.participant_a === user.id ? c.participant_b : c.participant_a
  );
  const { data: others } = otherIds.length
    ? await service
        .from("profiles")
        .select(
          "id, display_name, email, is_test_persona, avatar_url, linkedin_url, x_url, instagram_url, facebook_url, website_url"
        )
        .in("id", otherIds)
    : { data: [] as any[] };
  const profileById = new Map(
    (others ?? []).map((p) => [p.id, p] as const)
  );

  // Twin lookup for each conversation counterpart — feeds the blob
  // regex fallback in socialsFromBlob so the LinkedIn/X/IG/FB icons
  // appear next to every name where the counterpart added Sources
  // during onboarding. Without this the icons were silently empty
  // (only the explicit profile.linkedin_url columns rendered, and
  // those are mostly null in prod).
  const twinByOtherForSocial = new Map<
    string,
    { ai_export_blob: string | null; goals: string | null; deal_preferences: string | null }
  >();
  if (otherIds.length > 0) {
    try {
      const { data: convTwins } = await service
        .from("twin_profiles")
        .select("user_id, ai_export_blob, goals, deal_preferences")
        .in("user_id", otherIds);
      for (const t of (convTwins ?? []) as any[]) {
        twinByOtherForSocial.set(t.user_id, {
          ai_export_blob: t.ai_export_blob ?? null,
          goals: t.goals ?? null,
          deal_preferences: t.deal_preferences ?? null
        });
      }
    } catch {
      /* silent — icons will fall back to explicit profile columns */
    }
  }
  const nameById = new Map(
    (others ?? []).map((p) => [p.id, p.display_name || p.email] as const)
  );
  const isTestById = new Map(
    (others ?? []).map((p) => [p.id, p.is_test_persona] as const)
  );

  const visibleConversations = (conversations ?? []).filter(c => !hidden.has(c.participant_a === user.id ? c.participant_b : c.participant_a));
  const { data: recentMessages } = visibleConversations.length
    ? await supabase.from("messages").select("conversation_id,final_text,sent_at")
        .in("conversation_id", visibleConversations.map(c => c.id)).order("sent_at", { ascending: false }).limit(500)
    : { data: [] };
  const latestByConversation = new Map<string, { final_text: string; sent_at: string }>();
  for (const message of recentMessages ?? []) if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
  const sorted = visibleConversations.sort((a, b) =>
    new Date(latestByConversation.get(b.id)?.sent_at ?? b.created_at).getTime() - new Date(latestByConversation.get(a.id)?.sent_at ?? a.created_at).getTime());

  // Platform-users directory — fetched here so we can render a "talk to
  // someone now" list instead of the dead-end "go to dashboard" empty
  // state. Excludes the current user + anyone already in a conversation
  // with them. Same shape we use on /dashboard.
  const { data: platformUsers } = await service
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .eq("is_test_persona", false)
    .neq("id", user.id);
  const platformIds = (platformUsers ?? []).map((p: any) => p.id);
  const { data: platformTwins } = platformIds.length
    ? await service
        .from("twin_profiles")
        .select(
          "user_id, goals, deal_preferences, communication_style, ai_export_blob"
        )
        .in("user_id", platformIds)
    : { data: [] as any[] };
  const twinByUserMsg = new Map(
    (platformTwins ?? []).map((t: any) => [t.user_id, t] as const)
  );
  const existingConvIds = new Set(otherIds);

  // Use the SAME tiny token-overlap heuristic as dashboard so the score
  // shown here is comparable. Inline rather than imported to keep this
  // page server-component-pure.
  const { data: myTwinForScore } = await service
    .from("twin_profiles")
    .select("goals, deal_preferences, communication_style, ai_export_blob")
    .eq("user_id", user.id)
    .maybeSingle();
  function score(a: string, b: string): number {
    const norm = (s: string) =>
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
    const STOP = new Set([
      "with",
      "from",
      "that",
      "this",
      "have",
      "your",
      "they",
      "them",
      "about",
      "their",
      "would",
      "could",
      "should",
      "people",
      "looking",
      "really",
      "still",
      "going"
    ]);
    const arrA = Array.from(new Set(norm(a).filter((w) => !STOP.has(w))));
    const arrB = Array.from(new Set(norm(b).filter((w) => !STOP.has(w))));
    if (arrA.length === 0 || arrB.length === 0) return 0;
    const setB = new Set(arrB);
    let overlap = 0;
    for (const w of arrA) if (setB.has(w)) overlap += 1;
    const union = arrA.length + arrB.length - overlap;
    return Math.round((overlap / union) * 100);
  }
  const myBlob = [
    myTwinForScore?.goals ?? "",
    (myTwinForScore as any)?.deal_preferences ?? "",
    (myTwinForScore as any)?.communication_style ?? "",
    (myTwinForScore as any)?.ai_export_blob ?? ""
  ]
    .filter(Boolean)
    .join(" ");
  const platformDirectory = (platformUsers ?? [])
    .filter(p => !hidden.has(p.id))
    .filter((p: any) => {
      if (existingConvIds.has(p.id)) return false;
      // Substance gate — hide twins who signed up but never seeded any
      // onboarding data. Without this filter, the directory shows raw
      // emails as names + 0% sync, which reads as a dead-end.
      const t = twinByUserMsg.get(p.id);
      const hasGoals = ((t as any)?.goals ?? "").trim().length > 5;
      const hasDealPrefs =
        ((t as any)?.deal_preferences ?? "").trim().length > 5;
      const hasBlob =
        ((t as any)?.ai_export_blob ?? "").trim().length > 80;
      return hasGoals || hasDealPrefs || hasBlob;
    })
    .map((p: any) => {
      const t = twinByUserMsg.get(p.id) as any;
      const blob = (t?.ai_export_blob || "") as string;
      // Skip markdown headers, bare URLs, and key-only lines so the row
      // never shows "# Public footprint (https://...)" as the context.
      const headlineFromBlob = (() => {
        if (!blob || typeof blob !== "string") return "";
        const lines = blob
          .split(/[\n\r]/)
          .map((l: string) => l.trim())
          .filter(Boolean);
        for (const l of lines) {
          if (l.length < 28 || l.length > 220) continue;
          if (l.startsWith("#")) continue;
          if (/^https?:\/\/\S+\s*$/.test(l)) continue;
          if (/^[a-zA-Z_][\w\s]{0,30}:\s*https?:\/\//.test(l)) continue;
          if (l.split(/\s+/).length < 4) continue;
          return l;
        }
        return "";
      })();
      // Deterministic 4-signal pair score (unigram + bigram + goals +
      // complementary fit). No more "everyone shows 12% because the
      // raw jaccard rounded to 2 and the floor took over."
      const connection_score = computePairScore(myTwinForScore ?? {}, t ?? {});
      return {
        id: p.id,
        display_name: p.display_name as string | null,
        email: p.email as string,
        avatar_url: p.avatar_url as string | null,
        goals: (t?.goals as string | null) ?? null,
        headline_fallback: headlineFromBlob,
        connection_score
      };
    })
    .sort((a, b) => b.connection_score - a.connection_score);

  // Status badges — same logic as dashboard so the two surfaces stay
  // consistent: sealed / your turn / waiting on {first} / negotiating.
  const convIds = (conversations ?? []).map((c) => c.id);
  type AgrResp = { conversation_id: string; user_id: string; response: string };
  const { data: allResps } = convIds.length
    ? await service
        .from("agreement_responses")
        .select("conversation_id, user_id, response")
        .in("conversation_id", convIds)
    : { data: [] as AgrResp[] };
  const respsByConv = new Map<string, AgrResp[]>();
  for (const r of (allResps ?? []) as AgrResp[]) {
    const list = respsByConv.get(r.conversation_id) ?? [];
    list.push(r);
    respsByConv.set(r.conversation_id, list);
  }

  // "Changed / edited" signal — Jack wants the messages list to show
  // when a proposal was accepted, denied, OR changed/edited (folding in
  // what the now-removed /proposals page used to surface). A conversation
  // counts as "changed" when an AGREEMENT-bearing message was edited.
  const editedConvIds = new Set<string>();
  if (convIds.length > 0) {
    try {
      const { data: editedMsgs } = await service
        .from("messages")
        .select("conversation_id, final_text")
        .in("conversation_id", convIds)
        .eq("edited", true);
      for (const m of (editedMsgs ?? []) as any[]) {
        if (String(m.final_text ?? "").includes(">>> AGREEMENT:")) {
          editedConvIds.add(m.conversation_id);
        }
      }
    } catch {
      /* messages.edited missing in a fork — skip the changed tag */
    }
  }

  function statusForConv(c: {
    id: string;
    participant_a: string;
    participant_b: string;
  }):
    | { kind: "sealed"; label: string; color: string }
    | { kind: "your_turn"; label: string; color: string }
    | { kind: "accepted"; label: string; color: string }
    | { kind: "denied"; label: string; color: string }
    | { kind: "changed"; label: string; color: string }
    | { kind: "negotiating"; label: string; color: string }
    | null {
    const rs = respsByConv.get(c.id) ?? [];
    const mine = rs.find((r) => r.user_id === user!.id);
    const otherId =
      c.participant_a === user!.id ? c.participant_b : c.participant_a;
    const theirs = rs.find((r) => r.user_id === otherId);
    // Denied takes priority — a rejection is the clearest end-state.
    if (mine?.response === "rejected" || theirs?.response === "rejected") {
      return { kind: "denied", label: "✕ denied", color: "var(--red, #ef4444)" };
    }
    if (mine?.response === "accepted" && theirs?.response === "accepted") {
      return { kind: "sealed", label: "✓ deal sealed", color: "var(--green)" };
    }
    if (theirs?.response === "accepted" && !mine) {
      return {
        kind: "your_turn",
        label: "→ your turn",
        color: "var(--amber-bright)"
      };
    }
    if (mine?.response === "accepted" && !theirs) {
      const otherName = (nameById.get(otherId) ?? "them") as string;
      return {
        kind: "accepted",
        label: `✓ you accepted · waiting on ${otherName.split(/\s+/)[0]}`,
        color: "var(--green)"
      };
    }
    if (editedConvIds.has(c.id)) {
      return {
        kind: "changed",
        label: "✎ proposal changed",
        color: "var(--amber-bright)"
      };
    }
    if (rs.length > 0) {
      return {
        kind: "negotiating",
        label: "↻ negotiating",
        color: "var(--text-dim)"
      };
    }
    return null;
  }

  const blockedByPending = searchParams?.blocked === "pending";
  const owedCount = Math.max(0, Number(searchParams?.owed ?? 0) || 0);
  const owedLabel =
    owedCount === 1 ? "1 proposal" : `${owedCount || "some"} proposals`;

  return (
    <AppShell>
      <header className="page-heading"><div><h1>Messages</h1><p>{sorted.length} {sorted.length === 1 ? "conversation" : "conversations"}</p></div><Link href="/dashboard" className="retro-btn"><UserPlus size={16} aria-hidden="true" />New connection</Link></header>

      {blockedByPending && (
        <div className="retro-panel mt-5 p-4 text-sm">
          <div className="font-semibold">Reply to pending proposals first.</div>
          <div className="retro-dim mt-1">
            You have {owedLabel} waiting. Accept, deny, or edit the proposal
            before starting more conversations.
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        // Empty state — replace the dead-end "go to dashboard" CTA with
        // the same platform-users directory the dashboard shows. Users
        // with no conversations land on a populated list with connection
        // scores, ready to click connect. The most actionable empty
        // state we can build without leaving the page.
        <div className="mt-8">
          <div className="retro-panel p-5 text-sm">
            <div className="font-semibold">
              No conversations yet. Pick someone on SyncedIn to start.
            </div>
            <div className="retro-dim mt-1">
              Your twin handles the back-and-forth. You pick who. Sorted by
              connection score — twins with the most overlap with yours
              surface first.
            </div>
          </div>
          {platformDirectory.length === 0 ? (
            <div className="retro-panel p-4 text-sm mt-4">
              <div className="font-semibold">
                You&apos;ve already met everyone on the platform.
              </div>
              <div className="retro-dim mt-1">
                Head to{" "}
                <Link href="/invite" className="underline">
                  /invite
                </Link>{" "}
                and send a custom invite. Each invite becomes a one-of-one
                landing page that already knows who they are.
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {platformDirectory.slice(0, 20).map((p) => {
                const blurb = p.goals || p.headline_fallback || "";
                const sc = p.connection_score;
                const scoreColor =
                  sc >= 50
                    ? "var(--amber-bright)"
                    : sc >= 25
                      ? "var(--text)"
                      : "var(--text-dim)";
                return (
                  <form
                    action={startConversationWithUser}
                    key={p.id}
                    className="retro-panel retro-panel-hover p-4 flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar
                        id={p.id}
                        name={p.display_name || p.email}
                        avatarUrl={p.avatar_url}
                        size={36}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">
                          {p.display_name || p.email}
                        </div>
                        {blurb && (
                          <div className="retro-dim text-xs mt-1 line-clamp-2">
                            {blurb}
                          </div>
                        )}
                      </div>
                    </div>
                    <input type="hidden" name="userId" value={p.id} />
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div
                        className="text-xs font-mono"
                        style={{
                          color: scoreColor,
                          letterSpacing: "0.04em",
                          fontWeight: 700
                        }}
                        title="Connection score: how much your twin's profile overlaps with theirs."
                      >
                        {sc}% sync
                      </div>
                      <button
                        type="submit"
                        className="retro-btn retro-btn-primary text-xs"
                      >
                        connect &gt;
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {/* Warm the Next.js route bundle cache for every visible
              conversation so clicks land on the loading.tsx skeleton
              in <50ms, then stream the real page in. */}
          <ConversationPrefetch ids={sorted.map((c) => c.id)} />
          {sorted.map((c) => {
            const otherId =
              c.participant_a === user.id ? c.participant_b : c.participant_a;
            const isTest = isTestById.get(otherId);
            return (
              <div
                key={c.id}
                className="retro-panel retro-panel-hover connection-row p-4"
                style={{ position: "relative", paddingRight: 44 }}
              >
                <ReportAccountButton reportedUserId={otherId} reportedName={nameById.get(otherId) ?? undefined} />
                {/* Always-visible chevron — same affordance as poll list
                    cards. Previous version had pointer-events:none and
                    the parent <div> wasn't a link, so clicks on the
                    chevron landed on dead space. Now the chevron IS a
                    Link with prefetch so tapping it navigates straight
                    into the conversation. */}
                <Link
                  href={`/conversations/${c.id}`}
                  prefetch={true}
                  aria-label={`Open conversation with ${nameById.get(otherId) ?? "this person"}`}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    border: "1px solid var(--border-bright)",
                    background: "var(--panel-2)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-dim)",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none"
                  }}
                >
                  →
                </Link>
                <div className="flex items-start gap-3">
                  <Link
                    href={`/conversations/${c.id}`}
                    prefetch={true}
                    className="shrink-0"
                  >
                    <Avatar
                      id={otherId}
                      name={nameById.get(otherId) ?? "Unknown"}
                      avatarUrl={profileById.get(otherId)?.avatar_url ?? null}
                      size={44}
                    />
                  </Link>
                  <Link
                    href={`/conversations/${c.id}`}
                    prefetch={true}
                    className="min-w-0 flex-1"
                  >
                    <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                      <span>{nameById.get(otherId) ?? "Unknown"}</span>
                      {/* Clickable LinkedIn/X/IG/Facebook/website pills
                          next to the counterpart's name — quick way to
                          dig deeper into who they are without opening
                          the conversation. */}
                      {(() => {
                        const op = profileById.get(otherId) as any;
                        if (!op) return null;
                        return (
                          <SocialIconRow
                            urls={socialsFromBlob(
                              op,
                              twinByOtherForSocial.get(otherId)
                            )}
                            size={12}
                            gap={3}
                          />
                        );
                      })()}
                      {(() => {
                        const st = statusForConv(c);
                        if (!st) return null;
                        return (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              color: st.color,
                              border: `1px solid ${st.color}`,
                              background: "transparent",
                              letterSpacing: "0.04em"
                            }}
                          >
                            {st.label}
                          </span>
                        );
                      })()}
                      {isTest && (
                        <span
                          className="retro-dim text-[10px]"
                          style={{
                            border: "1px solid var(--border-bright)",
                            padding: "1px 6px",
                            borderRadius: 4
                          }}
                        >
                          sample
                        </span>
                      )}
                    </div>
                    {c.counterpart_summary && (
                      <div className="retro-dim text-xs mt-1">
                        {c.counterpart_summary}
                      </div>
                    )}
                    {latestByConversation.get(c.id)?.final_text && <p className="message-preview retro-dim text-sm mt-2">{latestByConversation.get(c.id)!.final_text.slice(0, 220)}</p>}
                    {/* Outcome moved OUT of this Link into an editable
                        textbox below (a textarea can't live inside an
                        <a>). */}
                    <div className="retro-dim text-[11px] mt-1">
                      <ClientDate value={c.created_at} />
                    </div>
                  </Link>
                  <ExcitementControl
                    conversationId={c.id}
                    score={c.excitement_score}
                    locked={c.excitement_locked}
                  />
                </div>
                {/* Editable outcome + proposal actions. Outcome is an
                    in-place textbox (auto-saves on blur); locks once
                    accepted. */}
                {c.summary &&
                  (() => {
                    const rs = respsByConv.get(c.id) ?? [];
                    const mine = rs.find((r) => r.user_id === user.id);
                    const theirs = rs.find((r) => r.user_id !== user.id);
                    const accepted = mine?.response === "accepted";
                    const sealed =
                      accepted && theirs?.response === "accepted";
                    return (
                      <>
                        <EditableOutcome
                          conversationId={c.id}
                          initialText={c.summary as string}
                          accepted={accepted}
                          sealed={sealed}
                        />
                        <InlineActions
                          conversationId={c.id}
                          alreadyAccepted={accepted}
                          alreadyRejected={mine?.response === "rejected"}
                        />
                      </>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
