import { createServiceClient } from "@/lib/supabase/server";

export async function hiddenUserIds(userId: string): Promise<Set<string>> {
  const service = createServiceClient();
  const { data, error } = await service.from("user_blocks").select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (error) throw new Error("Safety preferences are temporarily unavailable.");
  const { data: suspended, error: suspendError } = await service.from("profiles").select("id").eq("is_suspended", true);
  if (suspendError) throw new Error("Safety preferences are temporarily unavailable.");
  return new Set([...(data ?? []).map(row => row.blocker_id === userId ? row.blocked_id : row.blocker_id), ...(suspended ?? []).map(row => row.id)]);
}

export async function connectionBlocked(a: string, b: string): Promise<boolean> {
  return (await hiddenUserIds(a)).has(b);
}
