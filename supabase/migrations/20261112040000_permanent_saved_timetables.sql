-- Saved student timetables remain attached to their account without expiry.
alter table public.saved_timetables alter column expires_at drop not null;
