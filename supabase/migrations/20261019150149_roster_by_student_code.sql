-- เก็บรหัสนักศึกษาแทน user id จะได้เพิ่มคนที่ยังไม่เคย login ได้
drop table enrollments;

create table enrollments (
  course_id uuid not null references courses (id) on delete cascade,
  student_code text not null check (student_code ~ '^[0-9]+$'),
  added_at timestamptz not null default now(),
  primary key (course_id, student_code)
);

alter table enrollments enable row level security;

alter table sessions add column on_date date not null;

create unique index sessions_schedule_date on sessions (schedule_id, on_date);

create index sessions_room_time on sessions (room_id, starts_at);
