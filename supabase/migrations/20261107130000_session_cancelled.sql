-- คาบที่ถูกลบแต่มีผลเช็คชื่อหรือใบลาอยู่ เก็บแถวไว้และทำเครื่องหมาย ข้อมูลจะได้ไม่หายตาม cascade
alter table sessions add column cancelled_at timestamptz;

-- คาบที่ถูกลบไม่กันเวลาเดิม สร้างคาบใหม่ทับได้
alter table sessions drop constraint sessions_course_id_starts_at_key;
create unique index sessions_course_start on sessions (course_id, starts_at)
  where cancelled_at is null;

drop index sessions_schedule_date;
create unique index sessions_schedule_date on sessions (schedule_id, on_date)
  where cancelled_at is null;
