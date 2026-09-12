import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Optional isolated PostgreSQL check; PGlite is not a production dependency.
const require = createRequire(import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const root = path.resolve(import.meta.dirname, "..");
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles (id uuid primary key references auth.users, email text not null);
    alter table public.profiles enable row level security;
    create policy profiles_select_all on public.profiles for select using (true);
    grant select on public.profiles to authenticated, anon;
    create table public.notification_preferences (user_id uuid primary key references public.profiles);
    grant select, insert, update on public.notification_preferences to authenticated, anon;
    create table public.notification_log (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles);
    create table public.messages (id uuid primary key default gen_random_uuid(), sender_user_id uuid, sent_at timestamptz, edited boolean, original_draft text, final_text text);
    create table public.edit_deltas (id uuid primary key default gen_random_uuid());
  `);
  const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
  const policies = schema.slice(schema.indexOf("alter table public.notification_preferences enable row level security;"), schema.indexOf("create table if not exists public.notification_log ("));
  assert.ok(policies.includes("notif_prefs_select_own"));
  await db.exec(policies);
  for (let run = 0; run < 2; run++) {
    for (const filename of ["0005_edit_magnitude.sql", "0006_phone_claw_messaging.sql", "0007_outreach_examples.sql"]) {
      await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", filename), "utf8"));
    }
  }
  await db.exec("create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()");
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3), ($4, $5, $6)", [
    owner, "owner@example.com", JSON.stringify({ phone_number: "+12025550123" }),
    other, "other@example.com", JSON.stringify({ phone_number: "+12025550124" })
  ]);
  const profileColumns = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='profiles'");
  assert.ok(profileColumns.rows.every((row) => !row.column_name.startsWith("phone")));
  const contacts = await db.query("select phone_number, phone_number_verified_at, phone_consent_source from notification_preferences order by user_id");
  assert.equal(contacts.rows.length, 2);
  assert.equal(contacts.rows[0].phone_number, "+12025550123");
  assert.equal(contacts.rows[0].phone_number_verified_at, null);
  assert.equal(contacts.rows[0].phone_consent_source, "signup");
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from twin_edit_baseline"), /permission denied/);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  assert.equal((await db.query("select * from notification_preferences")).rows.length, 1);
  assert.equal((await db.query("select * from notification_preferences where user_id=$1", [other])).rows.length, 0);
  await assert.rejects(db.query("insert into notification_preferences (user_id,phone_number) values ($1,$2)", [other, "+12025550125"]), /row-level security/);
  const changed = await db.query("update notification_preferences set phone_number=$1 where user_id=$2 returning user_id", ["+12025550125", owner]);
  assert.equal(changed.rows.length, 1);
  assert.equal((await db.query("update notification_preferences set phone_number=$1 where user_id=$2 returning user_id", ["+12025550125", other])).rows.length, 0);
  await db.query("insert into outreach_examples (user_id,context_key,person_title,person_url,edited_text) values ($1,'dinner','Recipient','https://example.com','Research dinner?')", [owner]);
  await assert.rejects(db.query("insert into outreach_examples (user_id,context_key,person_title,person_url,edited_text) values ($1,'wrong-owner','Recipient','https://example.com','Research dinner?')", [other]), /row-level security/);
  await assert.rejects(db.query("insert into outreach_examples (user_id,context_key,person_title,person_url,edited_text) values ($1,'too-long','Recipient','https://example.com',$2)", [owner, "x".repeat(301)]), /check constraint/);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
  assert.equal((await db.query("select * from outreach_examples")).rows.length, 0);
  assert.equal((await db.query("select phone_number from notification_preferences")).rows[0].phone_number, "+12025550124");
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select * from twin_edit_baseline"), /permission denied/);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  assert.equal((await db.query("select phone_number from notification_preferences")).rows.length, 0);
  await assert.rejects(db.query("insert into notification_preferences (user_id,phone_number) values ($1,$2)", [owner, "+12025550125"]), /row-level security/);
  assert.equal((await db.query("select * from profiles")).rows.length, 2);
  await db.exec("reset role; set role service_role");
  assert.equal((await db.query("select * from twin_edit_baseline")).rows.length, 0);
  console.log("PASS: migrations 0005-0007 run twice; signup stores private contacts; own-user read/write works; cross-user and anonymous contact access blocked; outreach RLS and 300-character constraint enforced; aggregate metrics are server-only.");
} finally {
  await db.close();
}
