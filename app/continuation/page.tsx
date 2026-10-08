import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "../AppShell";
import { ContinuationConsole } from "./ContinuationConsole";

/**
 * Chat-continuation invite (#166). Upload an iMsg/WhatsApp/Telegram/SMS
 * export, model the counterpart, generate "where it goes next."
 *
 * Use case Jack described: you've been messaging someone for weeks. Drop
 * the export here, watch the next 8–10 messages play out, then share
 * the result with them — "look where this is heading, want to make it
 * real?"
 */
export const dynamic = "force-dynamic";

export default async function ContinuationPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/continuation");

  return (
    <AppShell>
      <section className="mt-2">
        <header className="page-heading"><div><h1>Import a chat</h1><p>Where the conversation could go next.</p></div></header>

        <div className="mt-6">
          <ContinuationConsole />
        </div>
      </section>
    </AppShell>
  );
}
