alter table public.leave_attachments
  drop constraint leave_attachments_storage_path_key,
  add constraint leave_attachments_request_storage_key unique (leave_request_id, storage_path);

create function public.submit_leave_batch(
  p_student_id uuid, p_session_ids uuid[], p_reason text,
  p_document_details jsonb, p_storage_path text, p_file_name text,
  p_mime_type text, p_file_size integer
) returns table (id uuid)
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_session_ids), 0) not between 2 and 30 then
    raise exception 'INVALID_SESSION_COUNT' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_session_ids) as selected(session_id)
    where not exists (
      select 1 from public.sessions s
      join public.enrollments e on e.course_id = s.course_id
      join public.users u on u.student_id = e.student_code
      where s.id = selected.session_id and s.cancelled_at is null
        and u.id = p_student_id and u.role = 'student'
    )
  ) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  with requests as (
    insert into public.leave_requests (student_id, session_id, reason, document_details, ocr_text, ocr_status)
    select p_student_id, session_id, p_reason, p_document_details, '', 'pending'
    from unnest(p_session_ids) as selected(session_id)
    order by session_id
    returning leave_requests.id, leave_requests.session_id
  ), attachments as (
    insert into public.leave_attachments (leave_request_id, storage_path, file_name, mime_type, file_size)
    select requests.id, p_storage_path, p_file_name, p_mime_type, p_file_size from requests
    returning leave_request_id
  )
  select requests.id from requests
  join attachments on attachments.leave_request_id = requests.id
  order by array_position(p_session_ids, requests.session_id);
end;
$$;

revoke all on function public.submit_leave_batch(uuid, uuid[], text, jsonb, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_leave_batch(uuid, uuid[], text, jsonb, text, text, text, integer)
  to service_role;
