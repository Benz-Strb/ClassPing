create table public.saved_timetables (
  user_id uuid primary key references public.users(id) on delete cascade,
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 100),
  saved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > saved_at)
);

alter table public.saved_timetables enable row level security;

create policy saved_timetables_read_own on public.saved_timetables
for select to authenticated
using (user_id = (select auth.uid()) and expires_at > now());
