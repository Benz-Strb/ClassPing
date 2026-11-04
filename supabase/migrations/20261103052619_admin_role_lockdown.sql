-- ฟังก์ชันเดิมยังให้ anon/authenticated เรียกได้ (สิทธิ์ตั้งต้นของ Supabase) ใครก็ตั้งตัวเองเป็นแอดมินได้
-- และตัวแปร current_role ไปชนกับคำสงวน ทำให้ไม่เคยกันแอดมินคนสุดท้ายได้จริง
create or replace function public.admin_change_user_role(target_id uuid, next_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role public.user_role;
begin
  lock table public.users in share row exclusive mode;

  select u.role into old_role from public.users u where u.id = target_id;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if old_role = 'admin'
    and next_role <> 'admin'
    and (select count(*) from public.users u where u.role = 'admin') <= 1
  then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;

  update public.users set role = next_role where id = target_id;
end;
$$;

revoke all on function public.admin_change_user_role(uuid, public.user_role) from public, anon, authenticated;
grant execute on function public.admin_change_user_role(uuid, public.user_role) to service_role;

-- trigger ไม่ต้องให้ใครเรียกตรง ๆ
revoke all on function public.attendance_clear_review_reason() from public, anon, authenticated;
