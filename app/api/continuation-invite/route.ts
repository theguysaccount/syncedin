import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Turn a chat-continuation result into a shareable invite link (#166 +
 * Jack's "this is also a context import mechanism + lots of shareable
 * links" insight).
 *
 * Flow: user uploads their existing thread, sees the projected next 10
 * messages, then clicks "Make a shareable link." We create a
 * pending_invites row with the continuation embedded as the
 * conversation_starter. The other person hits /<slug>, sees the
 * projection on a public landing page, signs up to make it real.
 *
 * Each continuation = one viral asset. Bulk-mode (future) takes a folder
 * of threads and produces N links to send.
 *
 * POST { you_name, other_name, original_text, continuation_lines: [{speaker, body}] }
 *   → { slug, public_url }
 */
export const dynamic = "force-dynamic";

function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    you_name?: string;
    other_name?: string;
    continuation_lines?: Array<{ speaker?: string; body?: string }>;
    original_text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const youName = (body.you_name ?? "").toString().trim() || "the inviter";
  const otherName = (body.other_name ?? "").toString().trim() || "you";
  const lines = Array.isArray(body.continuation_lines)
    ? body.continuation_lines
    : [];
  if (lines.length < 2) {
    return NextResponse.json(
      { error: "missing_continuation" },
      { status: 400 }
    );
  }

  // Format the continuation as readable text — this becomes the
  // landing-page opener the recipient sees.
  const transcript = lines
    .map(
      (l) =>
        `**${(l.speaker ?? "?").trim()}:** ${(l.body ?? "").trim()}`
    )
    .join("\n\n");

  const starter = `Hey ${otherName} — ${youName} dropped our chat into a twin-simulation tool and this is the thread it projected forward. Look where we're heading. Want to make it real on SyncedIn?\n\n---\n\n${transcript}`;

  const outbound = `Hey ${otherName} — ran our convo through a tool that simulates where it's heading. Honestly worth a look: %URL%`;

  const service = createServiceClient();

  // Pick a meaningful slug — first name + 4-char random suffix. Falls
  // back to UUID-shaped on collision.
  const stem = slugify(otherName) || "chat";
  let slug = `${stem}-${Math.random().toString(36).slice(2, 6)}`;
  for (let i = 0; i < 4; i++) {
    const { data: collide } = await service
      .from("pending_invites")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (!collide) break;
    slug = `${stem}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { error: insErr } = await service.from("pending_invites").insert({
    slug,
    inviter_user_id: user.id,
    person_title: otherName,
    person_url: null,
    person_highlights: { source: "chat_continuation" },
    conversation_starter: starter,
    outbound_message: outbound
  });
  if (insErr) {
    console.error("[continuation-invite] insert failed", insErr);
    return NextResponse.json(
      {
        error: "create_failed",
        detail: insErr.message
      },
      { status: 500 }
    );
  }

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://syncedin.org"
  ).replace(/\/$/, "");
  return NextResponse.json({
    ok: true,
    slug,
    public_url: `${baseUrl}/${slug}`
  });
}
