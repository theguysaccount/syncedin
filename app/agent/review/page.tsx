import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "../../BrandMark";
import { ThemeSync } from "../../ThemeSync";
import { AgentReview } from "./AgentReview";
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const db = createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const prefs = user
    ? await db
        .from("notification_preferences")
        .select("phone_number")
        .eq("user_id", user.id)
        .maybeSingle()
    : null;
  return (
    <main className="app-frame agent-page" data-clarity-mask="True">
      <ThemeSync />
      <header className="agent-page-nav">
        <Link href="/" aria-label="SyncedIn home">
          <BrandMark />
        </Link>
      </header>
      <div className="agent-page-content">
        <AgentReview
          id={searchParams.id || ""}
          signedIn={!!user}
          initialPhone={prefs?.data?.phone_number || ""}
        />
      </div>
    </main>
  );
}
