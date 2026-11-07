-- คณะและสาขาที่อ่านจากบัตรนักศึกษาออนไลน์ตอนยืนยันตัวตน ไม่เก็บภาพบัตร
-- null = ยังไม่ยืนยันบัตร หรือ OCR อ่านบรรทัดนั้นไม่มั่นใจ
alter table users
  add column faculty text,
  add column major text;
