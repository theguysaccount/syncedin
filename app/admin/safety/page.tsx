import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "../../AppShell";
import { reviewSafetyReport } from "./actions";
export const dynamic = "force-dynamic";
export default async function SafetyPage() {
  const { data: { user } } = await createClient().auth.getUser();
  if (user?.email?.toLowerCase() !== "jacksonjezio@gmail.com") notFound();
  const service = createServiceClient();
  const { data: reports, error } = await service.from("account_reports").select("*").eq("status", "open").order("created_at").limit(200);
  if (error) throw new Error("Safety review queue is unavailable.");
  return <AppShell><header className="page-heading"><div><h1>Safety review</h1><p>{reports?.length ?? 0} open reports. Review within 24 hours.</p></div><Link href="/admin/reports" className="retro-btn">Error reports</Link></header>
    {(reports ?? []).map(report => {
      const overdue = Date.now() - new Date(report.created_at).getTime() > 86400000;
      return <article key={report.id} className="border-b py-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3"><h2 className="font-semibold">{report.category}</h2><span className={overdue ? "retro-red text-xs" : "retro-dim text-xs"}>{overdue ? "Overdue" : "Due within 24 hours"}</span></div>
        <p className="text-sm my-3 whitespace-pre-wrap">{report.reason || "No details provided."}</p>
        <p className="text-xs retro-dim mb-3">Reported account: {report.reported_user_id}</p>
        <form action={reviewSafetyReport} className="flex items-center gap-3 flex-wrap">
          <input type="hidden" name="report_id" value={report.id} />
          <label className="text-xs flex gap-2 items-center"><input type="checkbox" name="confirmed" value="yes" required />I reviewed the evidence and confirm this decision.</label>
          <button name="decision" value="dismiss" className="retro-btn">Dismiss</button>
          <button name="decision" value="suspend" className="retro-btn retro-btn-primary">Suspend account and remove messages</button>
        </form>
      </article>;
    })}
    {!reports?.length && <p className="retro-dim text-sm">No open safety reports.</p>}
  </AppShell>;
}
