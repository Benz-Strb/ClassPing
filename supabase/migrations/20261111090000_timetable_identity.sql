alter table public.saved_timetables
  add column identity jsonb,
  add column ownership_proof text;

-- Verification proofs are only returned through the authenticated API.
drop policy if exists saved_timetables_read_own on public.saved_timetables;
