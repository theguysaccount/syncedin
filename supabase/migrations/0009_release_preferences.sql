begin;
-- Existing source depends on these optional fields; production was missing them.
alter table public.profiles add column if not exists portfolio_about text;
alter table public.profiles add column if not exists portfolio_theme jsonb;
alter table public.notification_preferences add column if not exists on_new_match boolean not null default true;
alter table public.notification_preferences add column if not exists match_threshold integer not null default 65;
alter table public.notification_preferences add column if not exists on_weekly_digest boolean not null default true;

-- Capturing a required phone number is not permission to send texts.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare opted_in boolean := coalesce(new.raw_user_meta_data->>'messaging_opt_in', 'false') = 'true';
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  if (new.raw_user_meta_data->>'phone_number') ~ '^\+[0-9]{10,15}$' then
    insert into public.notification_preferences (user_id, phone_number, phone_consent_at, phone_consent_source, on_text_notifications)
    values (new.id, new.raw_user_meta_data->>'phone_number', case when opted_in then now() else null end, 'signup', opted_in)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
commit;
