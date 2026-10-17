-- ตารางกลางของ ClassPing ใช้ร่วมกันทั้งฝั่งเช็คชื่อและฝั่งลา/รายงาน
-- เว็บและแอปไม่เข้าตารางตรง ๆ ทุกอย่างผ่าน NestJS (service key)
-- เลยเปิด RLS ทุกตารางไว้โดยไม่สร้าง policy

create extension if not exists vector with schema extensions;

create type user_role as enum ('student', 'teacher', 'admin');
create type camera_kind as enum ('front', 'door');
create type attendance_status as enum ('present', 'late', 'absent', 'leave', 'pending');

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null,
  student_id text unique,
  pdpa_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  section text,
  teacher_id uuid not null references users (id),
  classroom_course_id text unique,
  created_at timestamptz not null default now()
);

create table enrollments (
  course_id uuid not null references courses (id) on delete cascade,
  student_id uuid not null references users (id) on delete cascade,
  primary key (course_id, student_id)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table cameras (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id),
  kind camera_kind not null,
  token_hash text not null unique,
  last_seen_at timestamptz
);

-- weekday: 0 = อาทิตย์ ... 6 = เสาร์
create table schedules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  room_id uuid not null references rooms (id)
);

-- เปลี่ยนเฉพาะวัน: ย้ายห้อง เปลี่ยนเวลา หรืองดสอน
create table schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules (id) on delete cascade,
  on_date date not null,
  cancelled boolean not null default false,
  room_id uuid references rooms (id),
  start_time time,
  end_time time,
  unique (schedule_id, on_date)
);

-- absent_after_min เป็น null แปลว่านับขาดตอนหมดคาบ
create table attendance_rules (
  course_id uuid primary key references courses (id) on delete cascade,
  late_after_min int not null default 15,
  absent_after_min int,
  out_of_room_limit_min int not null default 15
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  schedule_id uuid references schedules (id) on delete set null,
  room_id uuid not null references rooms (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique (course_id, starts_at)
);

-- pose: front | left | right | up | down
create table face_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  pose text not null,
  embedding extensions.vector(512) not null,
  image_path text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table attendance (
  session_id uuid not null references sessions (id) on delete cascade,
  student_id uuid not null references users (id) on delete cascade,
  status attendance_status not null,
  first_seen_at timestamptz,
  confidence real,
  image_path text,
  updated_by uuid references users (id),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table door_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  student_id uuid references users (id),
  direction text not null check (direction in ('out', 'in')),
  occurred_at timestamptz not null,
  image_path text
);

alter table users enable row level security;
alter table courses enable row level security;
alter table enrollments enable row level security;
alter table rooms enable row level security;
alter table cameras enable row level security;
alter table schedules enable row level security;
alter table schedule_overrides enable row level security;
alter table attendance_rules enable row level security;
alter table sessions enable row level security;
alter table face_profiles enable row level security;
alter table attendance enable row level security;
alter table door_events enable row level security;
