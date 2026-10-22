-- หน้าที่กล้องจับได้แต่ไม่ตรงกับใครในวิชา เก็บไว้ 7 วันแล้วลบเอง
create table unknown_faces (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  image_path text not null,
  seen_at timestamptz not null
);

create index unknown_faces_session on unknown_faces (session_id, seen_at desc);
create index unknown_faces_seen_at on unknown_faces (seen_at);

alter table unknown_faces enable row level security;

-- รูปหน้าที่แนบกับผลเช็คชื่อ ไม่เปิดสาธารณะ ดูได้ผ่าน URL ที่ API เซ็นให้เท่านั้น
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;
