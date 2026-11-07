-- คาบสอบต้องมีเกณฑ์นอกห้องของตัวเอง เติมค่าที่ว่างจากเกณฑ์ของวิชาก่อน แล้วค่อยบังคับ
update sessions s
set out_of_room_limit_min = r.out_of_room_limit_min
from attendance_rules r
where s.kind = 'exam'
  and s.out_of_room_limit_min is null
  and r.course_id = s.course_id;

alter table sessions drop constraint sessions_exam_fields;
alter table sessions add constraint sessions_exam_fields check (
  (kind = 'class' and title is null and late_after_min is null and absent_after_min is null
    and out_of_room_limit_min is null)
  or (kind = 'exam' and schedule_id is null and title is not null and late_after_min is not null
    and out_of_room_limit_min is not null)
);
