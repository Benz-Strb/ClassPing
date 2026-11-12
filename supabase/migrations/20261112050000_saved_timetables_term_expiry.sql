-- Backfill legacy permanent records without extending existing expiry dates.
update public.saved_timetables
set expires_at = saved_at + interval '5 months'
where expires_at is null;
alter table public.saved_timetables alter column expires_at set not null;
