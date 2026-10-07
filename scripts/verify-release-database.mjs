import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const qa = JSON.parse(fs.readFileSync(".qa/review-credentials.json", "utf8"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [a, b] = qa.accounts;
for (const account of qa.accounts) {
  const { data, error } = await admin.from("profiles").select("is_test_persona").eq("id", account.id).single();
  assert.equal(error, null); assert.equal(data.is_test_persona, true, "Only isolated release personas may be tested.");
}
const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: authError } = await client.auth.signInWithPassword({ email: a.email, password: a.password });
assert.equal(authError, null);
const message = { conversation_id: qa.conversationId, sender_user_id: a.id, original_draft: "Release safety test", final_text: "Release safety test", edited: false };
let checks = 0;
try {
  const { error } = await admin.from("user_blocks").upsert({ blocker_id: b.id, blocked_id: a.id });
  assert.equal(error, null);
  for (const sender_user_id of [a.id, b.id]) {
    const { error } = await admin.from("messages").insert({ ...message, sender_user_id });
    assert.equal(error?.code, "42501", "Service-role message writes must respect blocks in either direction."); checks++;
  }
  const { error: clientError } = await client.from("messages").insert(message);
  assert.equal(clientError?.code, "42501"); checks++;
  const { data: blocks, error: readError } = await client.from("user_blocks").select("*");
  assert.equal(readError, null); assert.equal(blocks.length, 0, "Other users cannot read someone else's block records."); checks++;
  const { error: mutateError } = await client.from("user_blocks").insert({ blocker_id: a.id, blocked_id: b.id });
  assert.equal(mutateError?.code, "42501"); checks++;
  const { error: suspensionError } = await client.from("profiles").update({ is_suspended: true }).eq("id", a.id);
  assert.equal(suspensionError?.code, "42501", "Users cannot change moderation status."); checks++;
  const { error: reportError } = await client.from("account_reports").insert({ reporter_user_id: b.id, reported_user_id: a.id, category: "other", reason: "Isolated QA spoof test" });
  assert.equal(reportError?.code, "42501", "Reporter identity must be authenticated."); checks++;
  const { error: ownerReadError } = await admin.from("notification_preferences").select("on_new_match,on_weekly_digest,match_threshold").eq("user_id", a.id).single();
  assert.equal(ownerReadError, null); checks++;
} finally {
  const { error } = await admin.from("user_blocks").delete().eq("blocker_id", b.id).eq("blocked_id", a.id);
  assert.equal(error, null);
  await client.auth.signOut();
}
console.log(`Live database verification passed: ${checks} block, suspension, ownership, and schema checks. No customer records changed.`);
