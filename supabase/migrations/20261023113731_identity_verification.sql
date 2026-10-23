-- ยืนยันว่าเป็นเจ้าของบัญชีด้วยบัตรนักศึกษาออนไลน์ก่อนลงทะเบียนใบหน้า
-- ไม่เก็บภาพบัตร เก็บแค่เวลาที่ผ่านกับคะแนนหน้าในบัตรเทียบหน้าสด
-- null = ยังไม่ยืนยัน กล้องจะไม่นับว่าลงทะเบียนแล้ว แม้ถ่ายครบทุกท่า
alter table users
  add column identity_verified_at timestamptz,
  add column identity_score real
    constraint users_identity_score_check check (identity_score between -1 and 1);
