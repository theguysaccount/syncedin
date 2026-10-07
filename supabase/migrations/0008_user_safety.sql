begin;
alter table public.profiles add column if not exists is_suspended boolean not null default false;
create or replace function public.protect_suspension_flag() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_suspended is distinct from old.is_suspended and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Only moderators can change suspension status.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_suspension_guard on public.profiles;
create trigger profiles_suspension_guard before update on public.profiles for each row execute function public.protect_suspension_flag();
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);
alter table public.user_blocks enable row level security;
drop policy if exists blocks_read_own on public.user_blocks;
create policy blocks_read_own on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;

-- Enforce blocks even on service-role generated messages and direct clients.
create or replace function public.enforce_conversation_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid;
begin
  if tg_table_name = 'conversations' then
    a := new.participant_a; b := new.participant_b;
  else
    select participant_a, participant_b into a, b from public.conversations where id = new.conversation_id;
  end if;
  if exists (select 1 from public.profiles where id in (a,b) and is_suspended) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_blocks where
    (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)) then
    raise exception 'This connection is blocked.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists conversations_block_guard on public.conversations;
create trigger conversations_block_guard before insert or update on public.conversations
for each row execute function public.enforce_conversation_block();
drop trigger if exists messages_block_guard on public.messages;
create trigger messages_block_guard before insert or update on public.messages
for each row execute function public.enforce_conversation_block();
revoke all on function public.enforce_conversation_block() from public;
drop policy if exists reports_insert_signed_in on public.account_reports;
create policy reports_insert_signed_in on public.account_reports for insert to authenticated
with check (auth.uid() = reporter_user_id);
commit;
