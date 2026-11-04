-- ไม่มีโค้ดใช้ door_events และตารางว่าง จึงแทนด้วยรอบนอกห้อง
drop table door_events;

-- หนึ่งแถว = ออกนอกห้องหนึ่งรอบ
create table door_trips (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  student_id uuid references users (id) on delete cascade,
  -- confirmed = รู้ว่าใคร · pending = ไม่แน่ใจ รออาจารย์ · unknown = ไม่เห็นหน้าหรือไม่ตรงใคร
  status text not null check (status in ('confirmed', 'pending', 'unknown')),
  out_at timestamptz not null,
  back_at timestamptz check (back_at > out_at),
  -- front = กล้องหน้าห้องเห็น · teacher = อาจารย์กรอก
  back_by text check (back_by in ('front', 'teacher')),
  confidence real,
  image_path text,
  updated_by uuid references users (id),
  check ((status = 'unknown') = (student_id is null)),
  check ((back_at is null) = (back_by is null))
);
create index on door_trips (session_id, student_id);
-- คนหนึ่งมีรอบที่ยังไม่กลับได้รอบเดียวต่อคาบ
create unique index door_trips_one_open on door_trips (session_id, student_id)
  where back_at is null and student_id is not null;
alter table door_trips enable row level security;

-- คาบสอบกำหนดเกณฑ์นอกห้องเอง คาบเรียนว่างไว้แล้วใช้ของวิชา
alter table sessions add column out_of_room_limit_min int check (out_of_room_limit_min >= 1);
update sessions s set out_of_room_limit_min = r.out_of_room_limit_min
  from attendance_rules r where s.kind = 'exam' and r.course_id = s.course_id;
