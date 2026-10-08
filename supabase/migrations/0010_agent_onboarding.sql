begin;
create table if not exists public.agent_enrollments (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique, review_hash text,
  agent_name text not null check (char_length(agent_name) between 1 and 60),
  profile jsonb not null, context jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','revoked')),
  user_id uuid references public.profiles(id) on delete cascade,
  agent_enabled boolean not null default false,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '24 hours',
  approved_at timestamptz, grant_expires_at timestamptz, revoked_at timestamptz
);
alter table public.agent_enrollments enable row level security;
revoke all on public.agent_enrollments from anon, authenticated;
grant all on public.agent_enrollments to service_role;
create index if not exists agent_enrollments_owner_idx on public.agent_enrollments(user_id);
create table if not exists public.agent_signup_rate_limits (
  key text primary key, requests integer not null default 1, expires_at timestamptz not null
);
alter table public.agent_signup_rate_limits enable row level security;
revoke all on public.agent_signup_rate_limits from anon, authenticated;
grant all on public.agent_signup_rate_limits to service_role;
create or replace function public.agent_signup_rate(p_key text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.agent_signup_rate_limits where expires_at < now();
  update public.agent_enrollments set profile='{}', context='{}', review_hash=null, status='revoked', revoked_at=now()
    where status='pending' and expires_at < now();
  insert into public.agent_signup_rate_limits(key, expires_at) values(p_key, now()+interval '20 minutes')
    on conflict(key) do update set requests=public.agent_signup_rate_limits.requests+1 returning requests into n;
  return n;
end $$;
create or replace function public.approve_agent_enrollment(p_id uuid, p_review_hash text, p_user_id uuid, p_profile jsonb, p_phone text, p_agent_enabled boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.agent_enrollments;
begin
  select * into e from public.agent_enrollments where id=p_id for update;
  if not found or e.status <> 'pending' or e.expires_at <= now() or e.review_hash is distinct from p_review_hash then
    raise exception 'This draft has expired or already been reviewed.';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id and not is_suspended) then raise exception 'Account is unavailable.'; end if;
  update public.profiles set display_name=p_profile->>'display_name',
    handle=coalesce(handle, 'member-'||substr(replace(p_user_id::text,'-',''),1,12)) where id=p_user_id;
  insert into public.twin_profiles(user_id,goals,deal_preferences,communication_style,deal_breakers,current_city,achievements,ai_export_blob,updated_at)
    values(p_user_id,p_profile->>'goals',p_profile->>'deal_preferences',p_profile->>'communication_style',p_profile->>'deal_breakers',p_profile->>'current_city',p_profile->>'achievements',p_profile->>'ai_export_blob',now())
    on conflict(user_id) do update set goals=excluded.goals,
      deal_preferences=coalesce(excluded.deal_preferences,public.twin_profiles.deal_preferences),
      communication_style=coalesce(excluded.communication_style,public.twin_profiles.communication_style),
      deal_breakers=coalesce(excluded.deal_breakers,public.twin_profiles.deal_breakers),
      current_city=coalesce(excluded.current_city,public.twin_profiles.current_city),
      achievements=coalesce(excluded.achievements,public.twin_profiles.achievements),
      ai_export_blob=case when nullif(excluded.ai_export_blob,'') is null then public.twin_profiles.ai_export_blob
        else concat_ws(E'\n\n',nullif(public.twin_profiles.ai_export_blob,''),'# Approved agent context',excluded.ai_export_blob) end,
      updated_at=now();
  if p_phone is not null then
    insert into public.notification_preferences(user_id,phone_number,phone_consent_source,phone_consent_at,on_text_notifications)
      values(p_user_id,p_phone,'agent_review',null,false)
      on conflict(user_id) do update set phone_number=excluded.phone_number,
        phone_consent_source=case when public.notification_preferences.phone_number=excluded.phone_number then public.notification_preferences.phone_consent_source else 'agent_review' end,
        phone_consent_at=case when public.notification_preferences.phone_number=excluded.phone_number then public.notification_preferences.phone_consent_at else null end,
        phone_number_verified_at=case when public.notification_preferences.phone_number=excluded.phone_number then public.notification_preferences.phone_number_verified_at else null end,
        on_text_notifications=case when public.notification_preferences.phone_number=excluded.phone_number then public.notification_preferences.on_text_notifications else false end;
  end if;
  update public.agent_enrollments set status='approved',user_id=p_user_id,approved_at=now(),
    agent_enabled=p_agent_enabled,grant_expires_at=case when p_agent_enabled then now()+interval '24 hours' else null end,
    profile='{}',context='{}',review_hash=null where id=p_id;
  return p_id;
end $$;
create table if not exists public.agent_introduction_drafts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid not null references public.agent_enrollments(id) on delete cascade,
  counterpart_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300), created_at timestamptz not null default now(),
  unique(enrollment_id,counterpart_id)
);
alter table public.agent_introduction_drafts enable row level security;
revoke all on public.agent_introduction_drafts from anon, authenticated;
grant all on public.agent_introduction_drafts to service_role;
create or replace function public.save_agent_introduction(p_user_id uuid,p_enrollment_id uuid,p_counterpart_id uuid,p_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.agent_enrollments; result uuid;
begin
  select * into e from public.agent_enrollments where id=p_enrollment_id for update;
  if not found or e.user_id is distinct from p_user_id or e.status <> 'approved' or not e.agent_enabled
    or e.revoked_at is not null or e.grant_expires_at is null or e.grant_expires_at <= now() then
    raise exception 'Agent access is pending, expired, or revoked.';
  end if;
  if p_counterpart_id=p_user_id or not exists(select 1 from public.profiles where id=p_user_id and not is_suspended)
    or not exists(select 1 from public.profiles where id=p_counterpart_id and not is_suspended and not is_test_persona and handle is not null)
    or exists(select 1 from public.user_blocks where (blocker_id=p_user_id and blocked_id=p_counterpart_id) or (blocker_id=p_counterpart_id and blocked_id=p_user_id)) then
    raise exception 'This connection is unavailable.';
  end if;
  insert into public.agent_introduction_drafts(user_id,enrollment_id,counterpart_id,text)
    values(p_user_id,p_enrollment_id,p_counterpart_id,p_text)
    on conflict(enrollment_id,counterpart_id) do update set text=excluded.text,created_at=now() returning id into result;
  return result;
end $$;
revoke all on function public.agent_signup_rate(text) from public, anon, authenticated;
revoke all on function public.approve_agent_enrollment(uuid,text,uuid,jsonb,text,boolean) from public, anon, authenticated;
revoke all on function public.save_agent_introduction(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.agent_signup_rate(text) to service_role;
grant execute on function public.approve_agent_enrollment(uuid,text,uuid,jsonb,text,boolean) to service_role;
grant execute on function public.save_agent_introduction(uuid,uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
