-- เก็บผล OCR ของหลักฐานการลาไว้เป็นข้อมูลร่างให้นักศึกษาและอาจารย์ตรวจสอบ
create type leave_ocr_status as enum ('pending', 'completed', 'failed');

alter table leave_requests
  add column ocr_text text,
  add column ocr_status leave_ocr_status not null default 'pending';
