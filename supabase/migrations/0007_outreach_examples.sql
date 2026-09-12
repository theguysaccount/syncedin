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
