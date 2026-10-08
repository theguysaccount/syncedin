import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../AppShell";
import NewConversationFinder from "./NewConversationFinder";

export default function NewConversationPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  const errors: Record<string, string> = {
    not_found:
      "Couldn't find that user. Try searching by name above, or invite them.",
    self: "You can't start a conversation with yourself.",
    email: "Enter an email address.",
    create: "Couldn't create the conversation. Try again."
  };
  const error = searchParams.error ? errors[searchParams.error] : null;

  return (
    <AppShell>
      <header className="page-heading">
        <div><h1>New conversation</h1><p>Find who you want to sync with.</p></div>
        <Link href="/dashboard" className="retro-btn"><ArrowLeft size={16} aria-hidden="true" />Back to Discover</Link>
      </header>
      <div className="max-w-3xl">
        <div>
          <NewConversationFinder />
        </div>

        {error && (
          <div
            className="auth-error mt-4"
            role="alert"
            style={{ borderColor: "var(--red)" }}
          >
            <p className="text-sm retro-red">{error}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
