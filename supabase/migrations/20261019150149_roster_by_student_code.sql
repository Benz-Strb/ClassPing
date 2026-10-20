-- อาจารย์ต้องเพิ่มนักศึกษาด้วยรหัสได้ก่อนที่นักศึกษาจะเคย login
-- แต่แถวใน users เกิดตอน login ครั้งแรกเท่านั้น จึงเก็บรหัสนักศึกษาแทน id
-- แล้วจับคู่กับ users.student_id ตอนใช้งาน (ซิงก์ Classroom ใช้รหัสจากเมลได้เหมือนกัน)
-- ตารางยังไม่มีข้อมูล สร้างใหม่ได้เลย
drop table enrollments;

create table enrollments (
  course_id uuid not null references courses (id) on delete cascade,
  student_code text not null check (student_code ~ '^[0-9]+$'),
  added_at timestamptz not null default now(),
  primary key (course_id, student_code)
);

alter table enrollments enable row level security;

-- วันที่ของคาบตามเวลาไทย ตารางประจำหนึ่งแถวมีได้หนึ่งคาบต่อวัน
-- ใช้หาคาบเดิมตอนอาจารย์แก้ตารางหรือเปลี่ยนเฉพาะวัน
alter table sessions add column on_date date not null;

create unique index sessions_schedule_date on sessions (schedule_id, on_date);

-- กล้องถามว่าตอนนี้ห้องนี้มีคาบไหม
create index sessions_room_time on sessions (room_id, starts_at);
