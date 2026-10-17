import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Quick-feedback widget endpoint. Writes a single row to the lightweight
 * `feedback` table (separate from /feedback's feedback_posts which powers
 * the public Canny-style page). Designed for the "report a thing" widget
 * Jack mounts at the bottom of the dashboard: optional screenshot data
 * URL, a free-text message, and a `surface` tag that says which page the
 * user was on when they sent it.
 *
 * Auth optional — we still capture user_id when present so feedback can
 * be tied back to the sender for follow-up. Unauthenticated submissions
 * land with user_id = null. RLS allows insert in both cases.
 */
export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let body: {
    message?: string;
    image_data_url?: string;
    surface?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, 3000);
  if (!message) {
    return NextResponse.json(
      { error: "missing_message" },
      { status: 400 }
    );
  }

  // Cap image_data_url at ~600KB (data URL is base64 so ~450KB raw image).
  // Anything bigger gets stripped rather than rejected — we'd rather
  // capture the message than fail the whole submit.
  let image: string | null = null;
  if (
    typeof body.image_data_url === "string" &&
    body.image_data_url.startsWith("data:image/") &&
    body.image_data_url.length <= 600_000
  ) {
    image = body.image_data_url;
  }

  const surface = (body.surface ?? "")
    .toString()
    .trim()
    .slice(0, 120) || null;
  const userAgent =
    req.headers.get("user-agent")?.slice(0, 300) || null;

  const service = createServiceClient();
  const { error } = await service.from("feedback").insert({
    user_id: user?.id ?? null,
    message,
    image_data_url: image,
    surface,
    user_agent: userAgent
  });

  if (error) {
    console.error("[feedback/quick] insert failed", error);
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
