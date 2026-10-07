"use server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
export async function reviewSafetyReport(form: FormData) {
  const { data: { user } } = await createClient().auth.getUser();
  if (user?.email?.toLowerCase() !== "jacksonjezio@gmail.com") throw new Error("Forbidden");
  const id = String(form.get("report_id") ?? "");
  const action = String(form.get("decision") ?? "");
  if (!["dismiss", "suspend"].includes(action) || form.get("confirmed") !== "yes") throw new Error("Confirm the review decision.");
  const service = createServiceClient();
  const { data: report, error } = await service.from("account_reports").select("id,reported_user_id").eq("id", id).single();
  if (error || !report || report.reported_user_id === user.id) throw new Error("This report cannot be actioned here.");
  if (action === "suspend") {
    const { error: suspendError } = await service.from("profiles").update({ is_suspended: true, portfolio_about: null }).eq("id", report.reported_user_id);
    if (suspendError) throw new Error("Suspension failed.");
    const { error: banError } = await service.auth.admin.updateUserById(report.reported_user_id, { ban_duration: "876000h" });
    if (banError) throw new Error("Profile hidden, but account sign-in suspension needs attention.");
    const { error: removalError } = await service.from("messages").delete().eq("sender_user_id", report.reported_user_id);
    if (removalError) throw new Error("Account suspended, but content removal needs attention.");
    for (const [table, column] of [["feedback_comments", "user_id"], ["feedback_posts", "user_id"], ["polls", "created_by"], ["conferences", "owner_user_id"]]) {
      const { error } = await service.from(table).delete().eq(column, report.reported_user_id);
      if (error) throw new Error(`Account suspended, but removal from ${table} needs attention.`);
    }
  }
  const { error: reviewError } = await service.from("account_reports").update({ status: action === "suspend" ? "actioned" : "dismissed" }).eq("id", id);
  if (reviewError) throw new Error("Couldn't update the report.");
  revalidatePath("/admin/safety");
}
