-- ห้องหนึ่งมีกล้องแต่ละชนิดได้อย่างละตัว ทำให้สร้าง/หมุน token พร้อมกันแล้วไม่เกิดกล้องซ้ำ
create unique index cameras_room_kind_key on cameras (room_id, kind);

-- ล็อกตารางช่วงสั้น ๆ เพื่อกันสองคำขอลดสิทธิ์แอดมินคนสุดท้ายพร้อมกัน
create or replace function admin_change_user_role(target_id uuid, next_role user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role user_role;
begin
  lock table users in share row exclusive mode;

  select role into current_role from users where id = target_id;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if current_role = 'admin'
    and next_role <> 'admin'
    and (select count(*) from users where role = 'admin') <= 1
  then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;

  update users set role = next_role where id = target_id;
end;
$$;

revoke all on function admin_change_user_role(uuid, user_role) from public;
grant execute on function admin_change_user_role(uuid, user_role) to service_role;
