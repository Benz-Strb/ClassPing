-- ระบบลา: คำขอลาและไฟล์หลักฐาน
create type leave_request_status as enum ('pending', 'approved', 'rejected');

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  reason text not null,
  status leave_request_status not null default 'pending',
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, session_id)
);

create table leave_attachments (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references leave_requests (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  created_at timestamptz not null default now()
);

create index leave_requests_student on leave_requests (student_id, created_at desc);
create index leave_requests_session on leave_requests (session_id, status);
create index leave_requests_review_queue on leave_requests (status, created_at);
create index leave_attachments_request on leave_attachments (leave_request_id);

alter table leave_requests enable row level security;
alter table leave_attachments enable row level security;

-- หลักฐานการลาเป็นข้อมูลส่วนตัว เปิดดูผ่าน signed URL จาก API เท่านั้น
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-evidence',
  'leave-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
