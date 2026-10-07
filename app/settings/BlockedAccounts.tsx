"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function BlockedAccounts({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function unblock(id: string) {
    setBusy(id); setError("");
    try {
      const res = await fetch("/api/block-account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked_user_id: id }) });
      if (!res.ok) throw new Error("Couldn't unblock this account. Please try again.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(null); }
  }
  return <div>
    {!accounts.length && <p className="text-sm retro-dim">No blocked accounts.</p>}
    {accounts.map(account => <div key={account.id} className="flex items-center justify-between gap-3 py-3 border-b" style={{ borderColor: "var(--border)" }}><span className="text-sm">{account.name}</span><button className="retro-btn" onClick={() => void unblock(account.id)} disabled={busy !== null}>{busy === account.id ? "Please wait..." : "Unblock"}</button></div>)}
    {error && <p className="retro-red text-sm" role="alert">{error}</p>}
  </div>;
}
