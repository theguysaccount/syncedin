-- TwinLink v1 schema
-- Run this in the Supabase SQL editor on a fresh project.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  is_test_persona boolean not null default false,
  created_at timestamptz not null default now()
);

-- Idempotent: adds the column if you already ran the previous schema.
alter table public.profiles
  add column if not exists is_test_persona boolean not null default false;
alter table public.profiles
  add column if not exists avatar_url text;
-- Public portfolio fields. `handle` is the URL slug at /u/<handle> — auto-
-- derived from display_name when the user finishes onboarding (see
-- onboarding save action). `portfolio_about` is freeform MySpace-style
-- copy the user can edit directly OR via the prompt-driven editor.
-- `portfolio_theme` stores visual customization (accent color, banner emoji,
-- vibe label) as JSONB so the prompt editor can rewrite it without schema
-- changes.
alter table public.profiles
  add column if not exists handle text unique;
alter table public.profiles
  add column if not exists portfolio_about text;
alter table public.profiles
  add column if not exists portfolio_theme jsonb;
-- Public social URLs / handles. Stored as full URLs so the UI can
-- link out without needing to know the per-platform url shape. Used
-- by the messaging UI to render a row of clickable platform icons
-- next to the user's name (so the counterpart can dig deeper into
-- who they're talking to before signing off on an agreement).
alter table public.profiles
  add column if not exists linkedin_url text;
alter table public.profiles
  add column if not exists x_url text;
alter table public.profiles
  add column if not exists instagram_url text;
alter table public.profiles
  add column if not exists facebook_url text;
alter table public.profiles
  add column if not exists website_url text;

-- =========================================================================
-- Calls — person-to-person audio + video sessions between conversation
-- participants. The call itself runs via embedded Jitsi (free public
-- instance for v1; can swap to self-hosted Jitsi or LiveKit later) and a
-- tldraw "context dream board" renders alongside it. When the call ends,
-- whichever party stops the recording pastes the transcript back into
-- the UI; the /api/calls/end route appends a structured "# Call with
-- {other} on {date}" block to BOTH participants' twin_profiles.ai_export_blob
-- so their twins use the call context in future conversations.
-- =========================================================================
create table if not exists public.calls (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Jitsi room slug — deterministic per call so both participants land
  -- in the same room. Generated as `syncedin-{conversation_id_short}-{ts}`.
  room_id text not null,
  -- 'audio' | 'video' — same Jitsi room either way; we just stamp the
  -- intent so the analytics page can tell the two apart.
  kind text not null default 'video'
    check (kind in ('audio', 'video')),
  started_by uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript text,
  -- Stringified tldraw state — saved when the user clicks "save context
  -- and end call." Replay-renderable on the conversation page so both
  -- sides can revisit the whiteboard later.
  dream_board_state jsonb,
  -- External meeting URL (Zoom / Google Meet / MS Teams) when the
  -- participants prefer their real conferencing platform over the
  -- embedded Jitsi room. When set, the user can dispatch a read.ai bot
  -- to auto-record + transcribe the call; the bot's read.ai meeting id
  -- gets stamped here so we can later fetch the transcript.
  external_meeting_url text,
  external_platform text,
  read_ai_meeting_id text
);

create index if not exists calls_convo_idx
  on public.calls (conversation_id, started_at desc);

alter table public.calls enable row level security;

drop policy if exists "calls_select_participant" on public.calls;
create policy "calls_select_participant" on public.calls
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = calls.conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

drop policy if exists "calls_insert_participant" on public.calls;
create policy "calls_insert_participant" on public.calls
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = calls.conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

drop policy if exists "calls_update_participant" on public.calls;
create policy "calls_update_participant" on public.calls
  for update using (
    exists (
      select 1 from public.conversations c
      where c.id = calls.conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

-- Last-active timestamp on profiles — stamped by middleware on every
-- authed page load (debounced via cookie so the write only fires when
-- the value is older than 5 minutes). Drives the "active 3h ago" pill
-- on dashboard conversation cards so users know who's online vs. dormant.
alter table public.profiles
  add column if not exists last_active_at timestamptz;

create index if not exists profiles_last_active_idx
  on public.profiles (last_active_at desc);

-- AI-generated portfolio page — Jack: "generate a whole custom website
-- per person." Stored as structured JSON (hero, narrative, sections,
-- theme) so /u/[handle] can render a unique long-form site per user
-- instead of the cookie-cutter retro-panel stack. The default sections
-- (about / goals / looking for) still render as a fallback if
-- portfolio_page is null.
alter table public.profiles
  add column if not exists portfolio_page jsonb;
alter table public.profiles
  add column if not exists portfolio_page_generated_at timestamptz;

-- Cache of the generated demo twin-to-twin conversation per invite
-- slug. Without this, every fresh /<slug> page load (incognito, new
-- device, or after localStorage clear) re-ran the LLM and produced a
-- different conversation — wasted tokens + inconsistent demo for the
-- recipient. Saved once on first generation; re-used on every
-- subsequent visit. Jack: "make sure on these custom links we're not
-- regenerating the conversation every time."
alter table public.pending_invites
  add column if not exists demo_messages jsonb;
alter table public.pending_invites
  add column if not exists demo_generated_at timestamptz;
-- Context dive cached on the invite row too so the demo-conversation
-- generator can read it as input (architecture: dive-first, surface
-- conversation is a witty showcase of the alignment the dive found,
-- not a search for it).
alter table public.pending_invites
  add column if not exists context_dive jsonb;

-- Context-to-context "dive" — Jack's architecture shift: instead of the
-- visible message stack being the coordination layer, run a one-shot
-- background analysis that takes both twins' FULL contexts and produces
-- the underlying alignment (shared themes, complementary asks/offers,
-- friction points, recommended destination). The surface conversation
-- then becomes a shorter, pragmatic presentation of what the dive
-- already discovered.
--
-- Stored shape:
-- {
--   "shared_themes": [string],
--   "complementary_asks": [{ "side_a": string, "side_b": string, "why": string }],
--   "frictions": [string],
--   "hidden_synergies": [string],
--   "recommended_destination": string,
--   "headline": string,
--   "generated_at": ISO timestamp
-- }
alter table public.conversations
  add column if not exists context_dive jsonb;
alter table public.conversations
  add column if not exists context_dive_at timestamptz;

-- Funny mode flag — when ON for a conversation, the twin prompt
-- builder swaps to personality-first wiring (more emojis, lighter
-- tone, still drives toward outcome but in a much more fun
-- register). Per-conversation override only; head-toggle TBD.
alter table public.conversations
  add column if not exists funny_mode boolean not null default false;

-- Multi-source AI exports — Jack's "king" twin-context feature.
-- One row per (user, source) so users can paste their Claude
-- self-description AND their ChatGPT self-description AND their
-- Gemini/Perplexity ones separately. Each fed into the twin context
-- with provenance, so the prompt builder can blend or favor sources.
create table if not exists public.ai_exports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null, -- 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'other'
  content text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, source)
);
create index if not exists ai_exports_user_idx
  on public.ai_exports (user_id);
alter table public.ai_exports enable row level security;
drop policy if exists "ai_exports_owner_all" on public.ai_exports;
create policy "ai_exports_owner_all" on public.ai_exports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- File uploads — twin context (resumes, pitch decks, business lists)
-- + optional in-conversation share (twin attaches PDF/etc to a
-- proposal). Stored in Supabase Storage bucket 'twin-files' (must
-- be created manually); this table is the metadata index.
create table if not exists public.twin_files (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  size_bytes bigint not null default 0,
  mime_type text,
  storage_path text not null, -- path inside the 'twin-files' bucket
  kind text not null default 'context', -- 'context' | 'shareable'
  description text, -- "what this is" — fed into twin prompt for context files
  created_at timestamptz not null default now()
);
create index if not exists twin_files_user_idx
  on public.twin_files (user_id, kind, created_at desc);
alter table public.twin_files enable row level security;
drop policy if exists "twin_files_owner_all" on public.twin_files;
create policy "twin_files_owner_all" on public.twin_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Files shared inside a specific conversation. The twin can suggest
-- sharing a file with the counterpart; this row records the actual
-- share + timestamp.
create table if not exists public.conversation_files (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  file_id uuid not null references public.twin_files(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  shared_at timestamptz not null default now()
);
create index if not exists conv_files_conv_idx
  on public.conversation_files (conversation_id, shared_at desc);
alter table public.conversation_files enable row level security;
drop policy if exists "conv_files_participant_select" on public.conversation_files;
create policy "conv_files_participant_select" on public.conversation_files
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );
drop policy if exists "conv_files_owner_insert" on public.conversation_files;
create policy "conv_files_owner_insert" on public.conversation_files
  for insert with check (auth.uid() = shared_by);

-- Community / conference custom branding scraped from website_url.
-- Populated by a fire-and-forget pipeline at creation/edit time.
alter table public.conferences
  add column if not exists website_url text;
alter table public.conferences
  add column if not exists logo_url text;
alter table public.conferences
  add column if not exists brand_color text;
alter table public.conferences
  add column if not exists brand_meta jsonb;

-- Account-report table for the in-app "report user" flow. Anyone
-- signed-in can flag another account; jacksonjezio@gmail.com reviews
-- via /admin/reports (followup). Categories enforced at the API
-- layer rather than via a check constraint so we can add new ones
-- without a migration.
create table if not exists public.account_reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_user_id uuid references public.profiles(id) on delete set null,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  reason text,
  status text not null default 'open', -- open | reviewed | dismissed | actioned
  created_at timestamptz not null default now()
);
create index if not exists account_reports_reported_idx
  on public.account_reports (reported_user_id, created_at desc);
create index if not exists account_reports_status_idx
  on public.account_reports (status, created_at desc);
alter table public.account_reports enable row level security;
drop policy if exists "reports_insert_signed_in" on public.account_reports;
create policy "reports_insert_signed_in" on public.account_reports
  for insert with check (auth.uid() is not null);
drop policy if exists "reports_select_self" on public.account_reports;
create policy "reports_select_self" on public.account_reports
  for select using (auth.uid() = reporter_user_id);

create index if not exists profiles_handle_idx
  on public.profiles (lower(handle));

create index if not exists profiles_test_persona_idx
  on public.profiles (is_test_persona) where is_test_persona = true;

create table if not exists public.twin_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goals text,
  deal_preferences text,
  communication_style text,
  deal_breakers text,
  ai_export_blob text,
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active', -- 'active' | 'paused' | 'closed'
  created_at timestamptz not null default now(),
  constraint distinct_participants check (participant_a <> participant_b)
);

create index if not exists conversations_participants_idx
  on public.conversations (participant_a, participant_b);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  original_draft text not null,
  final_text text not null,
  edited boolean not null default false,
  sent_at timestamptz not null default now()
);

create index if not exists messages_conv_idx
  on public.messages (conversation_id, sent_at);

create table if not exists public.edit_deltas (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  original_draft text not null,
  edited_text text not null,
  conversation_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists edit_deltas_user_idx
  on public.edit_deltas (user_id, created_at desc);

-- Why did you make this edit? Captured at edit time. Meta-learning signal
-- that lets future drafts internalize the user's worldview, not just their
-- word choices.
alter table public.edit_deltas
  add column if not exists reason text;

create table if not exists public.outreach_examples (
  user_id uuid not null references public.profiles(id) on delete cascade,
  context_key text not null,
  person_title text not null,
  person_url text not null,
  person_background text not null default '',
  search_query text not null default '',
  connection_reason text not null default '',
  original_draft text not null default '',
  edited_text text not null check (char_length(btrim(edited_text)) between 1 and 300),
  edit_magnitude real,
  change_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, context_key)
);

create index if not exists outreach_examples_user_updated_idx
  on public.outreach_examples (user_id, updated_at desc);

alter table public.outreach_examples enable row level security;
grant select, insert, update, delete on public.outreach_examples to authenticated;

drop policy if exists outreach_examples_own on public.outreach_examples;
create policy outreach_examples_own on public.outreach_examples
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Location signals — used to bias Exa results toward people in the user's
-- geographic orbit (hometown + current city).
alter table public.twin_profiles
  add column if not exists hometown text;
alter table public.twin_profiles
  add column if not exists current_city text;

-- "Greatest life achievements" — surfaced on onboarding step 4. Used by
-- the twin as proof-of-capability when negotiating credibility-bound
-- deals, and rendered on the public portfolio + community summaries.
alter table public.twin_profiles
  add column if not exists achievements text;

-- User-editable sync-score prompt. The platform ships a default
-- algorithmic sync score (lib/pair-score.ts) — token + bigram overlap
-- + complementary-fit regex + substance floor. This column lets each
-- user write a NATURAL-LANGUAGE override describing what THEY think
-- counts as a high-sync match (e.g. "weight technical depth heavily,
-- ignore industry, +20 if they've raised a Series A"). v1 stores the
-- override + surfaces it in the (i) tooltip; v2 will wire a Claude-
-- graded modifier into pair-score so the override actually shifts
-- numbers per-pair.
alter table public.twin_profiles
  add column if not exists sync_score_prompt text;

-- =========================================================================
-- Conferences — a conference head signs up, gets a shareable join URL,
-- and discovery within that conference is limited to fellow members.
-- =========================================================================

create table if not exists public.conferences (
  slug text primary key,
  name text not null,
  description text,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  cover_url text,
  starts_at date,
  ends_at date,
  city text,
  -- 'conference' (one-time event) or 'community' (ongoing group). Same
  -- mechanics, different landing copy + sidebar label + URL prefix.
  kind text not null default 'conference'
    check (kind in ('conference', 'community')),
  created_at timestamptz not null default now()
);

-- Idempotent column add for existing deployments.
alter table public.conferences
  add column if not exists kind text not null default 'conference';
alter table public.conferences
  drop constraint if exists conferences_kind_check;
alter table public.conferences
  add constraint conferences_kind_check check (kind in ('conference', 'community'));

create index if not exists conferences_owner_idx
  on public.conferences (owner_user_id);

alter table public.conferences enable row level security;

drop policy if exists "conferences_public_read" on public.conferences;
create policy "conferences_public_read" on public.conferences
  for select using (true);

drop policy if exists "conferences_insert_own" on public.conferences;
create policy "conferences_insert_own" on public.conferences
  for insert with check (auth.uid() = owner_user_id);

drop policy if exists "conferences_update_own" on public.conferences;
create policy "conferences_update_own" on public.conferences
  for update using (auth.uid() = owner_user_id);

drop policy if exists "conferences_delete_own" on public.conferences;
create policy "conferences_delete_own" on public.conferences
  for delete using (auth.uid() = owner_user_id);

create table if not exists public.conference_members (
  conference_slug text not null references public.conferences(slug) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conference_slug, user_id)
);

create index if not exists conference_members_user_idx
  on public.conference_members (user_id);

alter table public.conference_members enable row level security;

-- Members can read the member list of conferences they're in (for discovery).
drop policy if exists "conf_members_read_if_member" on public.conference_members;
create policy "conf_members_read_if_member" on public.conference_members
  for select using (
    exists (
      select 1 from public.conference_members me
      where me.conference_slug = conference_members.conference_slug
        and me.user_id = auth.uid()
    )
    or exists (
      select 1 from public.conferences c
      where c.slug = conference_members.conference_slug
        and c.owner_user_id = auth.uid()
    )
  );

-- Anyone signed in can join (the join endpoint validates the slug exists).
drop policy if exists "conf_members_insert_self" on public.conference_members;
create policy "conf_members_insert_self" on public.conference_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "conf_members_delete_self" on public.conference_members;
create policy "conf_members_delete_self" on public.conference_members
  for delete using (auth.uid() = user_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.twin_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.edit_deltas enable row level security;

-- profiles: everyone can SELECT (so you can look up users by email to start a conversation);
-- only the owner can INSERT/UPDATE their own row.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- twin_profiles: only the owner reads/writes their own twin. The server uses the
-- service-role key to read counterpart twins in trusted server contexts.
drop policy if exists "twin_profiles_select_own" on public.twin_profiles;
create policy "twin_profiles_select_own" on public.twin_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "twin_profiles_insert_own" on public.twin_profiles;
create policy "twin_profiles_insert_own" on public.twin_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "twin_profiles_update_own" on public.twin_profiles;
create policy "twin_profiles_update_own" on public.twin_profiles
  for update using (auth.uid() = user_id);

-- conversations: only participants.
drop policy if exists "conv_select_participant" on public.conversations;
create policy "conv_select_participant" on public.conversations
  for select using (auth.uid() = participant_a or auth.uid() = participant_b);

drop policy if exists "conv_insert_participant" on public.conversations;
create policy "conv_insert_participant" on public.conversations
  for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);

-- messages: participants of the conversation only.
drop policy if exists "msg_select_participant" on public.messages;
create policy "msg_select_participant" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

drop policy if exists "msg_insert_sender" on public.messages;
create policy "msg_insert_sender" on public.messages
  for insert with check (auth.uid() = sender_user_id);

-- edit_deltas: each user can only read their own deltas (proprietary training corpus).
drop policy if exists "delta_select_own" on public.edit_deltas;
create policy "delta_select_own" on public.edit_deltas
  for select using (auth.uid() = user_id);

drop policy if exists "delta_insert_own" on public.edit_deltas;
create policy "delta_insert_own" on public.edit_deltas
  for insert with check (auth.uid() = user_id);

-- =========================================================================
-- Auto-create a profile row when a new auth user is created
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  if (new.raw_user_meta_data->>'phone_number') ~ '^\+[0-9]{10,15}$' then
    insert into public.notification_preferences (user_id, phone_number, phone_consent_at, phone_consent_source)
    values (new.id, new.raw_user_meta_data->>'phone_number', now(), 'signup')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- Agreement responses — accept (green ✓) / reject (red ✗) on a proposed
-- final destination. A rejection resets all responses and regenerates.
-- =========================================================================

create table if not exists public.agreement_responses (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('accepted', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists agreement_responses_conv_idx
  on public.agreement_responses (conversation_id);

alter table public.agreement_responses enable row level security;

drop policy if exists "agreement_responses_select_participant" on public.agreement_responses;
create policy "agreement_responses_select_participant" on public.agreement_responses
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = agreement_responses.conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

drop policy if exists "agreement_responses_insert_own" on public.agreement_responses;
create policy "agreement_responses_insert_own" on public.agreement_responses
  for insert with check (auth.uid() = user_id);

drop policy if exists "agreement_responses_update_own" on public.agreement_responses;
create policy "agreement_responses_update_own" on public.agreement_responses
  for update using (auth.uid() = user_id);

drop policy if exists "agreement_responses_delete_participant" on public.agreement_responses;
create policy "agreement_responses_delete_participant" on public.agreement_responses
  for delete using (
    exists (
      select 1 from public.conversations c
      where c.id = agreement_responses.conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

-- =========================================================================
-- Conversation summaries + excitement score
-- After a conversation completes, the platform generates a one-line outcome
-- summary, a "who they are" summary of the counterpart, and an excitement
-- score (0-100). The user can override the score; an override locks it and
-- is kept as a signal for calibrating future scoring.
-- =========================================================================

alter table public.conversations
  add column if not exists summary text;
alter table public.conversations
  add column if not exists counterpart_summary text;
alter table public.conversations
  add column if not exists excitement_score integer;
alter table public.conversations
  add column if not exists excitement_locked boolean not null default false;

-- Per-conversation goal override. Lets a single twin pivot what it's
-- pitching for THIS specific recipient without rewriting the head goal.
-- (Founder talking to investor → "raise"; same founder talking to candidate
--  → "hire"; same founder talking to journalist → "story angle".)
-- Null falls back to twin_profiles.goals. Set by the user from the
-- conversation page; downstream prompt builders read this first.
alter table public.conversations
  add column if not exists goal_override text;

-- Read receipts (WhatsApp-style ✓✓). Stamped on mount by each
-- participant. ChatUI uses these to render single-check (delivered) vs
-- double-check (read by counterpart) glyphs on outgoing messages.
alter table public.conversations
  add column if not exists last_read_a timestamptz;
alter table public.conversations
  add column if not exists last_read_b timestamptz;

-- Short, meaningful conversation slugs (#69). e.g. "jack-alex-7k4q9p".
-- Same for both participants — derived from sorted first-names plus a
-- 6-char fnv-hash of the conversation UUID. Resolved at /c/[slug].
alter table public.conversations
  add column if not exists short_slug text;
create unique index if not exists conversations_short_slug_uq
  on public.conversations (short_slug)
  where short_slug is not null;

-- Per-conversation sync-score override (#278). Mirrors the excitement
-- override pattern. User clicks the sync pill on a conv card, picks a
-- new 0-100, adds an optional reason. The override is the displayed
-- value going forward; the reason feeds future calibration. Different
-- from /api/scoring-prompt (which edits the GLOBAL rubric) — this is
-- a per-pair correction.
alter table public.conversations
  add column if not exists sync_score_override integer;
alter table public.conversations
  add column if not exists sync_score_override_reason text;
alter table public.conversations
  add column if not exists sync_score_override_at timestamptz;

-- =========================================================================
-- DM / Link.me partnership surface (#279). Public twin chat at
-- /dm/<handle> — visitor (anonymous or email-known) talks to the
-- creator's twin, optionally pays to boost to top of the creator's
-- inbox. Creator owns the thread server-side; visitor proves ownership
-- via a localStorage-stored visitor_token.
--
-- Distinct from `conversations` (twin-to-twin between two SyncedIn
-- users). DM threads are visitor-to-twin, with a creator on the other
-- end who reviews / edits posthoc. Different scoring, different routing.
-- =========================================================================

create table if not exists public.dm_threads (
  id uuid primary key default uuid_generate_v4(),
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  -- Random uuid handed to the visitor's browser at thread-start. We
  -- use this instead of cookies/auth so anonymous visitors can come back
  -- to the same thread from any device that stored it.
  visitor_token text not null,
  -- Captured opportunistically — we don't gate the first 2 messages on
  -- it but ask after, since email = the only way the creator can
  -- follow up off-platform.
  visitor_email text,
  visitor_name text,
  -- Paid-boost state. paid_cents is the amount; paid_at locks the order
  -- in the creator's inbox (paid threads pin to top).
  is_paid boolean not null default false,
  paid_cents integer,
  paid_at timestamptz,
  -- Lifecycle: open (default) → replied (creator engaged) → closed
  -- (creator dismissed or visitor abandoned).
  status text not null default 'open',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists dm_threads_creator_idx
  on public.dm_threads (creator_user_id, last_message_at desc);
create index if not exists dm_threads_creator_paid_idx
  on public.dm_threads (creator_user_id, is_paid desc, paid_at desc nulls last);
create unique index if not exists dm_threads_visitor_token_uq
  on public.dm_threads (visitor_token);

alter table public.dm_threads enable row level security;
-- Creator can read/manage their own threads. Visitor access is via
-- service client + visitor_token check in the API layer (no Supabase
-- auth for anonymous visitors).
drop policy if exists "dm_threads_creator_all" on public.dm_threads;
create policy "dm_threads_creator_all" on public.dm_threads
  for all using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);

create table if not exists public.dm_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  -- 'visitor' = anonymous-or-emailed person who initiated
  -- 'twin' = AI reply (free, automatic)
  -- 'creator' = real human creator reply (paid or unpaid)
  role text not null check (role in ('visitor', 'twin', 'creator')),
  body text not null,
  -- When the creator edits a twin reply posthoc, we keep the original
  -- body in `body` and add this stamp + revised text below. For MVP
  -- we just overwrite `body` and stamp this — original-preservation
  -- comes when we add the edit-history view.
  edited_by_creator_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_thread_idx
  on public.dm_messages (thread_id, created_at);

alter table public.dm_messages enable row level security;
drop policy if exists "dm_messages_creator_read" on public.dm_messages;
create policy "dm_messages_creator_read" on public.dm_messages
  for select using (
    exists (
      select 1 from public.dm_threads t
      where t.id = thread_id and t.creator_user_id = auth.uid()
    )
  );

-- Creator's existing offer links — populated by Link.me import (#280)
-- or manual entry. Read by the DM twin prompt so the AI can ROUTE
-- visitors to the right existing link instead of inventing answers.
-- intent = semantic label the twin uses ("course" / "advisory" /
-- "booking" / "merch" / "newsletter" / "free") — twin matches visitor
-- ask to intent.
create table if not exists public.dm_links (
  id uuid primary key default uuid_generate_v4(),
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  url text not null,
  intent text,
  position integer not null default 0,
  source text, -- 'linkme_import' | 'manual' | 'linktree_import' (future)
  created_at timestamptz not null default now()
);
create index if not exists dm_links_creator_idx
  on public.dm_links (creator_user_id, position);
alter table public.dm_links enable row level security;
drop policy if exists "dm_links_creator_all" on public.dm_links;
create policy "dm_links_creator_all" on public.dm_links
  for all using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);

-- Perf indexes (#271). These cover the hottest queries that were doing
-- full sequential scans:
--   - messages by sender (dashboard "completed convs" count, conv page
--     Promise.all for sync calc)
--   - agreement_responses by user_id (proposals page, dead-weight gate)
--   - profiles last_active_at desc (dashboard discovery ordering)
create index if not exists messages_sender_idx
  on public.messages (sender_user_id);
create index if not exists agreement_responses_user_idx
  on public.agreement_responses (user_id);
create index if not exists profiles_last_active_desc_idx
  on public.profiles (last_active_at desc nulls last)
  where is_test_persona = false;

-- #159 — Talk to your own twin. The user has 1:1 chats with their twin
-- to think out loud, get triage on pending proposals, or refine voice.
-- Single thread per user (no need for multi-thread now).
create table if not exists public.twin_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists twin_chat_user_idx
  on public.twin_chat_messages (user_id, created_at);
alter table public.twin_chat_messages enable row level security;
drop policy if exists "twin_chat_owner_all" on public.twin_chat_messages;
create policy "twin_chat_owner_all" on public.twin_chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- User feedback — drag-drop photo + message captured from the dashboard
-- bottom feedback widget. Read by humans + agents (per the in-product
-- thank-you copy). No RLS gate on insert beyond auth.uid() — anyone
-- signed in can leave feedback. SELECT is restricted to the row's owner
-- so users don't see each other's notes.
-- =========================================================================

create table if not exists public.feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  image_data_url text, -- inline base64 data URL for v1 (small images only)
  surface text, -- e.g. 'dashboard', 'mobile-drawer'
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_idx
  on public.feedback (user_id, created_at desc);

-- Ack column for the /admin/reports inbox. Jack: "I should have a way
-- to click 'error pasted' so I can checkmark the errors that I know I
-- already did." Acking groups errors by signature (computed in the
-- admin page) so a re-occurrence of the same bug doesn't re-flag what's
-- already in flight.
alter table public.feedback
  add column if not exists acked_at timestamptz;
alter table public.feedback
  add column if not exists ack_signature text;

create index if not exists feedback_acked_idx
  on public.feedback (acked_at, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_self" on public.feedback;
create policy "feedback_insert_self" on public.feedback
  for insert with check (auth.uid() = user_id or user_id is null);

drop policy if exists "feedback_select_self" on public.feedback;
create policy "feedback_select_self" on public.feedback
  for select using (auth.uid() = user_id);

-- Participants can UPDATE their conversations (needed for the excitement override).
drop policy if exists "conv_update_participant" on public.conversations;
create policy "conv_update_participant" on public.conversations
  for update using (
    auth.uid() = participant_a or auth.uid() = participant_b
  );

-- =========================================================================
-- Feedback / Requests — public Change.org style page where any signed-in
-- user can post a request and anyone can vote up or down.
-- =========================================================================

create table if not exists public.feedback_posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  author_name text,
  title text not null,
  body text,
  category text default 'idea' check (
    category in ('idea', 'bug', 'feature', 'other')
  ),
  created_at timestamptz not null default now()
);

create index if not exists feedback_posts_created_idx
  on public.feedback_posts (created_at desc);

alter table public.feedback_posts enable row level security;

drop policy if exists "feedback_posts_public_read" on public.feedback_posts;
create policy "feedback_posts_public_read" on public.feedback_posts
  for select using (true);

drop policy if exists "feedback_posts_insert_own" on public.feedback_posts;
create policy "feedback_posts_insert_own" on public.feedback_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "feedback_posts_delete_own" on public.feedback_posts;
create policy "feedback_posts_delete_own" on public.feedback_posts
  for delete using (auth.uid() = user_id);

-- Admin-reply + lifecycle columns for /feedback. Jack as admin can reply
-- to any post + move it through open → in_progress → completed so the
-- requester sees the resolution + the page can group by status. Updates
-- happen via the /api/admin/feedback-update server route which gates on
-- the admin email; the column is publicly readable.
alter table public.feedback_posts
  add column if not exists status text default 'open'
    check (status in ('open', 'in_progress', 'completed'));
alter table public.feedback_posts
  add column if not exists admin_reply text;
alter table public.feedback_posts
  add column if not exists admin_reply_at timestamptz;

create index if not exists feedback_posts_status_idx
  on public.feedback_posts (status, created_at desc);

-- Communities/Conferences shared additions:
-- (a) visibility — Public (listed in /communities + /conferences index,
--     anyone can Join), RequestToJoin (listed, admin approves each
--     request), Private (link-only, current default behavior).
-- (b) humans_chat — real human-typed messages between members, stored
--     per-room in community_chat_messages.
--
-- NOTE: Communities and conferences live in the SAME table
-- (public.conferences with kind ∈ {'conference','community'}), so the
-- new tables key off conference_id only — even for community rooms.
alter table public.conferences
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'request', 'private'));

create index if not exists conferences_visibility_idx
  on public.conferences (visibility);

-- Humans-only chat per room. conference_id references public.conferences
-- which holds both kinds. removed_at = soft-delete so admins can moderate
-- while preserving thread continuity.
create table if not exists public.community_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conference_id text not null references public.conferences(slug) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  author_avatar_url text,
  body text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create index if not exists community_chat_conference_idx
  on public.community_chat_messages (conference_id, created_at);

alter table public.community_chat_messages enable row level security;
drop policy if exists "ccmsg_read_all" on public.community_chat_messages;
create policy "ccmsg_read_all" on public.community_chat_messages
  for select using (true);
drop policy if exists "ccmsg_insert_authed" on public.community_chat_messages;
create policy "ccmsg_insert_authed" on public.community_chat_messages
  for insert with check (auth.uid() = author_id);

-- Join requests for visibility='request' rooms. Owner approves/rejects.
create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  conference_id text not null references public.conferences(slug) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists community_join_requests_idx
  on public.community_join_requests (conference_id, status);

alter table public.community_join_requests enable row level security;
drop policy if exists "cjr_read_own_or_admin" on public.community_join_requests;
create policy "cjr_read_own_or_admin" on public.community_join_requests
  for select using (auth.uid() = user_id);
drop policy if exists "cjr_insert_own" on public.community_join_requests;
create policy "cjr_insert_own" on public.community_join_requests
  for insert with check (auth.uid() = user_id);

-- Community comments on feedback posts. Jack: "lets also add the ability
-- for replies on these from general people." Anyone signed-in can post;
-- admin replies are marked at write time so the UI can highlight them.
create table if not exists public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feedback_posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists feedback_comments_post_idx
  on public.feedback_comments (post_id, created_at);

alter table public.feedback_comments enable row level security;

drop policy if exists "feedback_comments_read_all" on public.feedback_comments;
create policy "feedback_comments_read_all" on public.feedback_comments
  for select using (true);

drop policy if exists "feedback_comments_insert_authed" on public.feedback_comments;
create policy "feedback_comments_insert_authed" on public.feedback_comments
  for insert with check (auth.uid() is not null);

create table if not exists public.feedback_votes (
  post_id uuid not null references public.feedback_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists feedback_votes_post_idx
  on public.feedback_votes (post_id);

alter table public.feedback_votes enable row level security;

drop policy if exists "feedback_votes_public_read" on public.feedback_votes;
create policy "feedback_votes_public_read" on public.feedback_votes
  for select using (true);

drop policy if exists "feedback_votes_insert_own" on public.feedback_votes;
create policy "feedback_votes_insert_own" on public.feedback_votes
  for insert with check (auth.uid() = user_id);

drop policy if exists "feedback_votes_update_own" on public.feedback_votes;
create policy "feedback_votes_update_own" on public.feedback_votes
  for update using (auth.uid() = user_id);

drop policy if exists "feedback_votes_delete_own" on public.feedback_votes;
create policy "feedback_votes_delete_own" on public.feedback_votes
  for delete using (auth.uid() = user_id);

-- =========================================================================
-- Pending invites — landing pages at syncedin.org/<slug>
-- When a user has their twin draft an outreach to a person Exa found, we
-- generate a public landing-page invite. The recipient hits the URL, sees
-- the conversation starter from the twin, and signs up to reply.
-- =========================================================================

create table if not exists public.pending_invites (
  slug text primary key,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  person_title text,
  person_url text,
  person_highlights jsonb,
  conversation_starter text not null,
  claimed_by_user_id uuid references public.profiles(id) on delete set null,
  claimed_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pending_invites_inviter_idx
  on public.pending_invites (inviter_user_id);

-- Recipient's public profile photo URL (scraped from IG / X / LinkedIn).
-- Used to embed the recipient's face into the OG card so each invite
-- landing page personalizes the iMessage / Twitter / WhatsApp preview.
alter table public.pending_invites
  add column if not exists recipient_avatar_url text;

-- Outbound DM (sent over SMS / email / WhatsApp / LinkedIn) — this is the
-- personalized role-aware cold message the inviter copies and sends. It
-- talks about THE RECIPIENT'S work and why a sync is interesting.
--
-- `conversation_starter` is now the LANDING-PAGE opener — what the
-- recipient sees inside /<slug> after they click through. That message is
-- platform-context: "Hey, I'm on a new platform where twins connect to
-- surface win-wins between us." The two messages serve different audiences
-- (the recipient before vs. after the click) and used to be identical,
-- which felt redundant.
alter table public.pending_invites
  add column if not exists outbound_message text;

-- Analytics columns — let us measure invite CTR + A/B test variants of
-- the outbound message + landing opener over time.
--   sent_at        : set when the inviter marks-as-sent in BulkReach
--   visit_count    : incremented every time the /<slug> landing page renders
--   first_visit_at : timestamp of the first /<slug> render
--   message_variant: e.g. "v1-recipient-first" so we can compare CTR per
--                    template across cohorts.
alter table public.pending_invites
  add column if not exists sent_at timestamptz;
alter table public.pending_invites
  add column if not exists visit_count integer not null default 0;
alter table public.pending_invites
  add column if not exists first_visit_at timestamptz;
alter table public.pending_invites
  add column if not exists message_variant text;

-- Recipient contact captured at draft time. Lets us credit the original
-- inviter when the recipient signs up via the front door (syncedin.org/
-- login) instead of the /claim/<slug> link. Without these we could only
-- count claim-flow conversions, which under-reports real conversions by
-- a lot.
alter table public.pending_invites
  add column if not exists recipient_email text;
alter table public.pending_invites
  add column if not exists recipient_phone text;
alter table public.pending_invites
  add column if not exists recipient_handle text;

create index if not exists pending_invites_recipient_email_idx
  on public.pending_invites (recipient_email);

alter table public.pending_invites enable row level security;

-- Anyone can read by slug — these are public landing pages.
drop policy if exists "pending_invites_public_read" on public.pending_invites;
create policy "pending_invites_public_read" on public.pending_invites
  for select using (true);

-- Only the inviter can insert their own invites.
drop policy if exists "pending_invites_insert_own" on public.pending_invites;
create policy "pending_invites_insert_own" on public.pending_invites
  for insert with check (auth.uid() = inviter_user_id);

-- Only the inviter or the claimer can update (for claim-on-signup).
drop policy if exists "pending_invites_update_authorized" on public.pending_invites;
create policy "pending_invites_update_authorized" on public.pending_invites
  for update using (
    auth.uid() = inviter_user_id or auth.uid() = claimed_by_user_id
  );

-- =========================================================================
-- Scoring prompts — per-user override of the excitement-score system prompt.
-- When the user overrides a score, we log it as a calibration delta so future
-- scoring stays aligned with their taste.
-- =========================================================================

create table if not exists public.scoring_prompts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  prompt text not null,
  updated_at timestamptz not null default now()
);

alter table public.scoring_prompts enable row level security;

drop policy if exists "scoring_prompts_select_own" on public.scoring_prompts;
create policy "scoring_prompts_select_own" on public.scoring_prompts
  for select using (auth.uid() = user_id);

drop policy if exists "scoring_prompts_upsert_own" on public.scoring_prompts;
create policy "scoring_prompts_upsert_own" on public.scoring_prompts
  for insert with check (auth.uid() = user_id);

drop policy if exists "scoring_prompts_update_own" on public.scoring_prompts;
create policy "scoring_prompts_update_own" on public.scoring_prompts
  for update using (auth.uid() = user_id);

-- =========================================================================
-- Notification preferences + send log
-- Per-user toggles for what gets emailed; log prevents duplicates.
-- =========================================================================

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_address text, -- nullable: defaults to profiles.email
  phone_number text, -- private contact information, protected by owner-only RLS
  on_new_connection boolean not null default true,
  on_new_message boolean not null default true,
  on_agreement_accepted boolean not null default true,
  on_call_scheduled boolean not null default true,
  on_text_notifications boolean not null default true,
  preferred_messaging_service text not null default 'iMessage',
  updated_at timestamptz not null default now()
);

-- New-match notifications: fires when someone new finishes their twin AND
-- their pair score against this user is above match_threshold. Default
-- threshold is 65 — high enough to feel like a real match alert, not a
-- "someone joined" firehose. Existing users who don't run the new schema
-- migration get the default via the COALESCE in lib/notify.
alter table public.notification_preferences
  add column if not exists on_new_match boolean not null default true;
alter table public.notification_preferences
  add column if not exists match_threshold integer not null default 65;

-- Weekly proposals digest opt-in. Default ON so existing users start
-- receiving a Monday-morning roll-up of their unanswered proposals.
-- Jack: "one of the email notifications we need to add is a weekly
-- summary of proposals with buttons so you can click right into those."
alter table public.notification_preferences
  add column if not exists on_weekly_digest boolean not null default true;
alter table public.notification_preferences
  add column if not exists phone_number text;
alter table public.notification_preferences
  add column if not exists phone_number_verified_at timestamptz;
alter table public.notification_preferences
  add column if not exists phone_consent_at timestamptz;
alter table public.notification_preferences
  add column if not exists phone_consent_source text;
alter table public.notification_preferences
  add column if not exists on_text_notifications boolean not null default true;
alter table public.notification_preferences
  add column if not exists preferred_messaging_service text not null default 'iMessage';

alter table public.notification_preferences enable row level security;

drop policy if exists "notif_prefs_select_own" on public.notification_preferences;
create policy "notif_prefs_select_own" on public.notification_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "notif_prefs_insert_own" on public.notification_preferences;
create policy "notif_prefs_insert_own" on public.notification_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "notif_prefs_update_own" on public.notification_preferences;
create policy "notif_prefs_update_own" on public.notification_preferences
  for update using (auth.uid() = user_id);

create table if not exists public.notification_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, -- 'new_connection' | 'new_message' | 'agreement_accepted' | 'call_scheduled'
  subject_id uuid, -- conversation_id or other related row
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  email_address text,
  phone_number text,
  sent_channels text[],
  unique (user_id, dedupe_key)
);

alter table public.notification_log
  add column if not exists phone_number text;
alter table public.notification_log
  add column if not exists sent_channels text[];

create index if not exists notification_log_user_idx
  on public.notification_log (user_id, sent_at desc);

alter table public.notification_log enable row level security;

drop policy if exists "notif_log_select_own" on public.notification_log;
create policy "notif_log_select_own" on public.notification_log
  for select using (auth.uid() = user_id);

create table if not exists public.scoring_calibrations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  ai_score integer,
  user_score integer not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists scoring_calibrations_user_idx
  on public.scoring_calibrations (user_id, created_at desc);

alter table public.scoring_calibrations enable row level security;

drop policy if exists "scoring_calibrations_select_own" on public.scoring_calibrations;
create policy "scoring_calibrations_select_own" on public.scoring_calibrations
  for select using (auth.uid() = user_id);

drop policy if exists "scoring_calibrations_insert_own" on public.scoring_calibrations;
create policy "scoring_calibrations_insert_own" on public.scoring_calibrations
  for insert with check (auth.uid() = user_id);

-- =========================================================================
-- POLLS — ask a question to every twin on the platform, synthesize the
-- collective answer. Each user can see how their own twin answered and
-- override it; overrides feed back into future synthesis runs.
-- =========================================================================

create table if not exists public.polls (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  context text,                                  -- optional framing for the LLM
  status text not null default 'running',        -- 'running' | 'ready' | 'closed'
  synthesis text,                                -- LLM-generated paragraph summarizing all twins' answers
  synthesis_one_liner text,                      -- ≤140 char headline summary
  responses_count integer not null default 0,
  overrides_count integer not null default 0,
  created_at timestamptz not null default now(),
  synthesized_at timestamptz
);

create index if not exists polls_created_idx
  on public.polls (created_at desc);
create index if not exists polls_creator_idx
  on public.polls (created_by, created_at desc);

alter table public.polls enable row level security;

-- Everyone signed-in can read polls (they're network-wide).
drop policy if exists "polls_select_all_authed" on public.polls;
create policy "polls_select_all_authed" on public.polls
  for select using (auth.role() = 'authenticated');

drop policy if exists "polls_insert_own" on public.polls;
create policy "polls_insert_own" on public.polls
  for insert with check (auth.uid() = created_by);

drop policy if exists "polls_update_own" on public.polls;
create policy "polls_update_own" on public.polls
  for update using (auth.uid() = created_by);

create table if not exists public.poll_responses (
  id uuid primary key default uuid_generate_v4(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  twin_user_id uuid not null references public.profiles(id) on delete cascade,
  twin_response text not null,                   -- what the LLM generated as the twin's answer
  human_override text,                           -- user-provided correction (if any)
  was_overridden boolean not null default false,
  generated_at timestamptz not null default now(),
  overridden_at timestamptz,
  unique (poll_id, twin_user_id)
);

create index if not exists poll_responses_poll_idx
  on public.poll_responses (poll_id);
create index if not exists poll_responses_user_idx
  on public.poll_responses (twin_user_id, generated_at desc);

alter table public.poll_responses enable row level security;

drop policy if exists "poll_responses_select_all_authed" on public.poll_responses;
create policy "poll_responses_select_all_authed" on public.poll_responses
  for select using (auth.role() = 'authenticated');

-- Only the twin's owner can update their own response (override path).
drop policy if exists "poll_responses_update_own_twin" on public.poll_responses;
create policy "poll_responses_update_own_twin" on public.poll_responses
  for update using (auth.uid() = twin_user_id);
