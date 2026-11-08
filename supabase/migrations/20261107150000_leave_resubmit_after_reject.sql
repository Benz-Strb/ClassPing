-- ยื่นลาคาบเดิมใหม่ได้หลังถูกปฏิเสธ: กันซ้ำเฉพาะคำขอที่ยังไม่ถูกปฏิเสธ
alter table leave_requests
  drop constraint leave_requests_student_id_session_id_key;

create unique index leave_requests_active_per_session
  on leave_requests (student_id, session_id)
  where status <> 'rejected';
