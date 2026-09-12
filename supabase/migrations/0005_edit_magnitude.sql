-- Twin updater v2 — stage 1: edit-magnitude logging (measurement only).
-- The gap the design flagged as fix #1: today nothing measures whether the
-- twin's drafts are getting closer to what the user actually sends. This adds
-- the columns + a baseline view. No model behavior changes.
--
-- Safe to run on a live DB: additive, idempotent.

-- Per-message metric. edit_magnitude: 0 = sent unchanged (win) .. 1 = rewritten.
-- change_tags: the kind(s) of correction (add_number, remove_hedging, ...).
alter table messages    add column if not exists edit_magnitude real;
alter table messages    add column if not exists change_tags    text[];

-- Mirror onto edit_deltas so the training corpus carries the metric too.
alter table edit_deltas add column if not exists edit_magnitude real;
alter table edit_deltas add column if not exists change_tags    text[];

-- Index for the per-user rolling reads.
create index if not exists messages_sender_sent_idx
  on messages (sender_user_id, sent_at desc);

-- Baseline readout: per user, how often the twin's draft ships unchanged
-- (acceptance) and how big the average correction is (mean magnitude), over
-- all messages and over the most recent 30. This is the north-star to move.
create or replace view twin_edit_baseline as
with scored as (
  select
    sender_user_id                       as user_id,
    edit_magnitude                        as mag,
    (coalesce(edited, false) = false)     as accepted,
    row_number() over (
      partition by sender_user_id order by sent_at desc
    )                                     as rn
  from messages
  where original_draft is not null
    and final_text is not null
    and edit_magnitude is not null
)
select
  user_id,
  count(*)                                          as scored_messages,
  round(avg(case when accepted then 1 else 0 end)::numeric, 3) as acceptance_rate,
  round(avg(mag)::numeric, 3)                       as mean_edit_magnitude,
  round(avg(mag) filter (where rn <= 30)::numeric, 3) as mean_edit_magnitude_last30,
  round(avg(case when accepted then 1 else 0 end)
        filter (where rn <= 30)::numeric, 3)        as acceptance_rate_last30
from scored
group by user_id;

-- This cross-user aggregate is an internal report, not a client API.
revoke all on public.twin_edit_baseline from public, anon, authenticated;
grant select on public.twin_edit_baseline to service_role;
