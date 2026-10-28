-- ตรวจคำขอลาและบันทึก attendance ใน transaction เดียว
create function public.review_leave_request(
  p_request_id uuid,
  p_teacher_id uuid,
  p_decision text,
  p_review_note text
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_request public.leave_requests%rowtype;
begin
  select * into v_request
  from public.leave_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'LEAVE_REQUEST_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.sessions s
    join public.courses c on c.id = s.course_id
    where s.id = v_request.session_id and c.teacher_id = p_teacher_id
  ) then
    raise exception 'LEAVE_REQUEST_FORBIDDEN';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'LEAVE_REQUEST_NOT_PENDING';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'LEAVE_REQUEST_INVALID_DECISION';
  end if;

  update public.leave_requests
  set status = p_decision::public.leave_request_status,
      reviewed_by = p_teacher_id,
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.attendance (
      session_id, student_id, status, updated_by, updated_at
    ) values (
      v_request.session_id, v_request.student_id, 'leave', p_teacher_id, now()
    )
    on conflict (session_id, student_id) do update
    set status = 'leave', updated_by = p_teacher_id, updated_at = now();
  end if;
end;
$$;

revoke all on function public.review_leave_request(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_leave_request(uuid, uuid, text, text)
  to service_role;
