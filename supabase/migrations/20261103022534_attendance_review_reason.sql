-- null = รอตรวจเพราะไม่แน่ใจว่าใคร (แบบเดิม) · spoof = สงสัยว่าเป็นรูปหรือจอ
alter table attendance
  add column review_reason text check (review_reason in ('spoof')),
  add constraint attendance_reason_only_pending check (review_reason is null or status = 'pending');
