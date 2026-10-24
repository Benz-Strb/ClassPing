-- คาบสอบอยู่ในตาราง sessions เดียวกับคาบเรียน ไม่ได้มาจากตารางเรียน และมีเกณฑ์สาย/ขาดของตัวเอง
-- absent_after_min เป็น null แปลว่านับขาดตอนหมดคาบ เหมือน attendance_rules
alter table sessions
  add column kind text not null default 'class' check (kind in ('class', 'exam')),
  add column title text,
  add column late_after_min int check (late_after_min >= 0),
  add column absent_after_min int check (absent_after_min >= 0),
  add constraint sessions_exam_fields check (
    (kind = 'class' and title is null and late_after_min is null and absent_after_min is null)
    or (kind = 'exam' and schedule_id is null and title is not null and late_after_min is not null)
  );

-- อาจารย์คุมสอบ ผูกเป็นรายคาบ
create table session_proctors (
  session_id uuid not null references sessions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  primary key (session_id, user_id)
);

create index session_proctors_user on session_proctors (user_id);

-- บันทึกทุกครั้งที่มีคนเปิดดูกล้อง kind: live | playback | download
create table video_views (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('live', 'playback', 'download')),
  created_at timestamptz not null default now()
);

create index video_views_session on video_views (session_id, created_at desc);
create index video_views_user on video_views (user_id);

alter table session_proctors enable row level security;
alter table video_views enable row level security;
