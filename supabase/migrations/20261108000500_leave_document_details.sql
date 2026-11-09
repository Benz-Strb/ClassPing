alter table public.leave_requests
  add column document_details jsonb not null default '{}'::jsonb,
  add constraint leave_document_details_object check (jsonb_typeof(document_details) = 'object');
