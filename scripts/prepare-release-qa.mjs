import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const file = ".qa/review-credentials.json";
fs.mkdirSync(".qa", { recursive: true, mode: 0o700 });
if (fs.existsSync(file)) {
  console.log("Release QA accounts already prepared.");
  process.exit(0);
}
const accounts = [];
for (const [suffix, name, goals] of [
  ["review", "SyncedIn App Review", "Meet researchers and founders working on thoughtful AI products."],
  ["safety", "Safety Review Sample", "Connect with builders researching useful and trustworthy AI."]
]) {
  const email = `release-${suffix}-${Date.now()}@syncedin.org`;
  const password = crypto.randomBytes(24).toString("base64url");
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, release_test: true } });
  if (error) throw error;
  const id = data.user.id;
  const { error: profileError } = await client.from("profiles").upsert({ id, email, display_name: name, is_test_persona: true });
  if (profileError) throw profileError;
  const { error: twinError } = await client.from("twin_profiles").upsert({ user_id: id, goals, communication_style: "Warm, clear, concise. No em dashes." });
  if (twinError) throw twinError;
  const { error: notificationError } = await client.from("notification_preferences").upsert({
    user_id: id, on_new_connection: false, on_new_message: false, on_agreement_accepted: false,
    on_call_scheduled: false, on_new_match: false, on_weekly_digest: false, on_text_notifications: false
  });
  if (notificationError) throw notificationError;
  accounts.push({ id, email, password, name });
  fs.writeFileSync(file, JSON.stringify({ accounts }, null, 2), { mode: 0o600 });
}
const { data: conversation, error } = await client.from("conversations").insert({ participant_a: accounts[0].id, participant_b: accounts[1].id }).select("id").single();
if (error) throw error;
const { error: messageError } = await client.from("messages").insert({
  conversation_id: conversation.id, sender_user_id: accounts[1].id,
  original_draft: "I'd love to compare notes on making AI products more useful. What are you exploring?",
  final_text: "I'd love to compare notes on making AI products more useful. What are you exploring?", edited: false
});
if (messageError) throw messageError;
fs.writeFileSync(file, JSON.stringify({ accounts, conversationId: conversation.id }, null, 2), { mode: 0o600 });
console.log("Prepared two isolated test personas and a sample conversation. Credentials saved privately.");
