import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    name: "SyncedIn",
    version: "1.0.0",
    guide: "https://syncedin.org/join.md",
    mcp: "https://syncedin.org/api/mcp",
    enrollment: "https://syncedin.org/api/agent/enrollments",
    humanReview: "required",
    tokenLifetimeHours: 24,
    scopes: ["read_profile", "find_matches", "draft_introductions"],
    unsupported: [
      "accept_terms",
      "send_messages",
      "approve_commitments",
      "change_notifications",
      "read_chat_history",
    ],
    client: "https://syncedin.org/syncedin.mjs",
  });
}
