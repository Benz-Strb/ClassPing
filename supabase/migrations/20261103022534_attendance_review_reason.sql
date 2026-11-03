-- null = รอตรวจเพราะไม่แน่ใจว่าใคร (แบบเดิม) · spoof = สงสัยว่าเป็นรูปหรือจอ
alter table attendance
  add column review_reason text check (review_reason in ('spoof')),
  add constraint attendance_reason_only_pending check (review_reason is null or status = 'pending');

-- สถานะพ้นจาก pending แล้ว เหตุผลที่รอตรวจไม่ใช้อีก ล้างให้ทุกทางที่เขียน (รวมฟังก์ชัน SQL)
create or replace function public.attendance_clear_review_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    new.review_reason := null;
  end if;
  return new;
end;
$$;

create trigger attendance_clear_review_reason
  before insert or update on public.attendance
  for each row execute function public.attendance_clear_review_reason();
