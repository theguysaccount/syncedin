import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anthropic, TWIN_MODEL } from "@/lib/anthropic";
import type { Profile, TwinProfile } from "@/lib/types";

/**
 * Twin-voice broadcast message generator.
 *
 * Returns:
 *   {
 *     message:   string  // the default "join me on SyncedIn" invite,
 *                        // rewritten in the user's twin's voice.
 *     tweet:     string  // ≤260 chars, same idea, optimized for a tweet
 *   }
 *
 * Used by the BulkReachToolkit to pre-fill every broadcast channel
 * (iMessage, WhatsApp, Email, Tweet, Reddit, ...) with copy that actually
 * sounds like the inviter, not generic platform boilerplate.
 *
 * Light-weight: cached on the client for the session so we only hit Claude
 * once per dashboard load.
 */
export async function GET(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    `${url.protocol}//${url.host}`;

  const service = createServiceClient();
  const [{ data: profile }, { data: twin }] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id).single(),
    service
      .from("twin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);
  const p = profile as Profile | null;
  const t = twin as TwinProfile | null;
  const selfName = p?.display_name || p?.email?.split("@")[0] || "me";

  // Default fallbacks (used when the twin profile is empty OR the LLM
  // call fails). Keep the SyncedIn explainer + the URL so the message
  // is always self-sufficient.
  const fallbackMessage = `I'm on SyncedIn — an agent-to-agent protocol where two people's digital twins talk to each other and find the highest win-win between them. Worth 90 seconds. Join me: ${appUrl}`;
  const fallbackTweet = `Two digital twins, one win-win.\n\nJust joined SyncedIn — your clone talks to my clone, surfaces the deal, you walk in already knowing. ${appUrl}`;

  // If there's basically no twin data to draw from, return fallbacks fast
  // — no point spending a Claude call to rewrite generic copy as generic copy.
  const hasSignal =
    !!(t?.goals && t.goals.trim().length > 10) ||
    !!(t?.ai_export_blob && t.ai_export_blob.trim().length > 20);
  if (!hasSignal) {
    return NextResponse.json({
      message: fallbackMessage,
      tweet: fallbackTweet,
      voice: "default"
    });
  }

  try {
    const system = `You write short invite copy in the inviter's authentic voice. Return ONLY valid JSON:
{
  "message": "<broadcast invite, 2-3 sentences, ends with ${appUrl}>",
  "tweet":   "<≤260 chars, ends with ${appUrl}>"
}

Rules:
- First person, sounds like the inviter actually wrote it
- Explains SyncedIn as: an agent-to-agent protocol where two people's digital twins talk to each other and surface the win-win, so when humans meet they already know what to propose
- The message goes to friends/colleagues — keep it warm, specific, not corporate
- The tweet is for a public audience — punchy, intriguing, NOT salesy
- NO em-dashes, en-dashes, hashtags, or emojis
- NO "🚀", "✨", "🔗", or any unicode flair
- Inviter's URL is ALWAYS ${appUrl} (verbatim, at the end)`;

    const userContent = `Inviter: ${selfName}
Goals: ${t?.goals || "(none specified)"}
Voice / about-me blob: ${
      t?.ai_export_blob ? t.ai_export_blob.slice(0, 1200) : "(none specified)"
    }
Communication style: ${t?.communication_style || "(default)"}
Deal preferences: ${t?.deal_preferences || "(none specified)"}

Return the JSON now.`;

    const r = await anthropic.messages.create({
      model: TWIN_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userContent }]
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        message?: string;
        tweet?: string;
      };
      const message = (parsed.message || "").trim() || fallbackMessage;
      let tweet = (parsed.tweet || "").trim() || fallbackTweet;
      if (tweet.length > 280) tweet = tweet.slice(0, 277) + "...";
      // Belt-and-suspenders: guarantee the URL is present in both.
      const ensureUrl = (s: string) =>
        s.includes(appUrl) ? s : `${s} ${appUrl}`.trim();
      return NextResponse.json({
        message: ensureUrl(message),
        tweet: ensureUrl(tweet),
        voice: "twin"
      });
    }
  } catch (e) {
    console.warn("[twin-broadcast-message] llm failed", e);
  }

  return NextResponse.json({
    message: fallbackMessage,
    tweet: fallbackTweet,
    voice: "default"
  });
}
