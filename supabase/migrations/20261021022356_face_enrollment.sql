-- คนละหนึ่งแถวต่อท่า ถ่ายท่าเดิมซ้ำจะแทนที่แถวเดิม
alter table face_profiles
  add constraint face_profiles_pose_check
  check (pose in ('front', 'left', 'right', 'up', 'down'));

create unique index face_profiles_user_pose on face_profiles (user_id, pose);

-- รูปลงทะเบียนใบหน้า ไม่เปิดสาธารณะ ดูได้ผ่าน URL ที่ API เซ็นให้เท่านั้น
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faces', 'faces', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
