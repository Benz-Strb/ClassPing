create or replace function public.review_leave_request(
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

  if v_request.status::text = p_decision then
    raise exception 'LEAVE_REQUEST_NOT_PENDING';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
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
    set status = 'leave',
        image_path = case when public.attendance.status = 'pending' then null else public.attendance.image_path end,
        first_seen_at = case when public.attendance.status = 'pending' then null else public.attendance.first_seen_at end,
        confidence = case when public.attendance.status = 'pending' then null else public.attendance.confidence end,
        updated_by = p_teacher_id,
        updated_at = now();
  elsif v_request.status = 'approved' then
    delete from public.attendance
    where session_id = v_request.session_id and student_id = v_request.student_id
      and status = 'leave';
  end if;
end;
$$;

revoke all on function public.review_leave_request(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_leave_request(uuid, uuid, text, text)
  to service_role;

create function public.attendance_preserve_approved_leave()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'leave' and exists (
    select 1 from public.leave_requests
    where session_id = new.session_id and student_id = new.student_id and status = 'approved'
  ) then
    raise exception 'ATTENDANCE_HAS_APPROVED_LEAVE';
  end if;
  return new;
end;
$$;

create trigger attendance_preserve_approved_leave
before insert or update of status, session_id, student_id on public.attendance
for each row execute function public.attendance_preserve_approved_leave();
