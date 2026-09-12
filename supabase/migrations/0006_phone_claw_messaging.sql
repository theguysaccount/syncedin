-- Phone capture belongs in owner-only preferences, not publicly readable profiles.

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

alter table public.notification_log
  add column if not exists phone_number text;
alter table public.notification_log
  add column if not exists sent_channels text[];
