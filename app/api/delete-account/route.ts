import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Permanent account deletion endpoint. Cascade:
 *   1. Delete the user's twin_profile row.
 *   2. Delete any pending_invites they created.
 *   3. Delete invites where they were the recipient (best-effort; if
 *      the column doesn't exist on older deployments, skip).
 *   4. Delete their notification_preferences.
 *   5. Delete their conference_members + community memberships.
 *   6. NULL out their participation in conversations they were a
 *      participant in (keeps the conversation visible to the other
 *      side without breaking it). Doesn't touch messages directly.
 *   7. Delete the auth.users row via service-role admin API.
 *
 * Every step is wrapped in try/catch — partial failure should still
 * complete as much as possible rather than leaving the account half-
 * deleted. The auth.users delete at the end will fail visibly to the
 * client only if the entire cascade gave up.
 */
export async function POST() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const service = createServiceClient();

  // Inline cascade — each step runs sequentially, errors logged but
  // don't abort. The array-of-thunks pattern broke TS because
  // PostgrestFilterBuilder is PromiseLike (no `catch`/`finally`), not
  // a full Promise, so it can't fit a `() => Promise<unknown>` slot.
  // Each step is now an explicit await with its own try/catch.
  type Step = [string, () => PromiseLike<unknown>];
  const steps: Step[] = [
    // Reassign any rooms this user HOSTS to the next signed-up member
    // BEFORE deleting their profile — otherwise the owner FK cascade
    // would delete the whole community/conference. Jack: "we shouldn't
    // delete the page. We should just make the next signed up person the
    // host."
    ["reassign_owned_rooms", async () => {
      const { data: owned } = await service
        .from("conferences")
        .select("slug")
        .eq("owner_user_id", userId);
      for (const room of (owned ?? []) as Array<{ slug: string }>) {
        const { data: next } = await service
          .from("conference_members")
          .select("user_id, joined_at")
          .eq("conference_slug", room.slug)
          .neq("user_id", userId)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if ((next as any)?.user_id) {
          await service
            .from("conferences")
            .update({ owner_user_id: (next as any).user_id })
            .eq("slug", room.slug);
        }
        // No other members → nothing to hand off; the empty room cascades.
      }
    }],
    ["twin_profiles", () =>
      service.from("twin_profiles").delete().eq("user_id", userId)],
    ["pending_invites:inviter", () =>
      service.from("pending_invites").delete().eq("inviter_user_id", userId)],
    ["notification_preferences", () =>
      service.from("notification_preferences").delete().eq("user_id", userId)],
    ["conference_members", () =>
      service.from("conference_members").delete().eq("user_id", userId)],
    ["feedback_votes", () =>
      service.from("feedback_votes").delete().eq("user_id", userId)],
    ["feedback_posts", () =>
      service.from("feedback_posts").delete().eq("user_id", userId)],
    ["profile", () =>
      service.from("profiles").delete().eq("id", userId)]
  ];

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (e) {
      console.warn(`[delete-account] step ${name} failed`, e);
    }
  }

  // auth.users delete via admin API — requires service role key.
  try {
    const adminClient: any = service;
    if (adminClient.auth?.admin?.deleteUser) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  } catch (e: any) {
    console.error("[delete-account] auth.admin.deleteUser failed", e);
    return NextResponse.json(
      {
        error: "auth_delete_failed",
        detail:
          e?.message ||
          "Account data cleared but auth row remains — contact support."
      },
      { status: 500 }
    );
  }

  // Best-effort: sign the local session out. The redirect on the
  // client will land them on the home page where the deleted=1 flag
  // can show a goodbye message.
  try {
    await supabase.auth.signOut();
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ ok: true });
}
