import {
  rulesFor,
  statusAt,
  type AttendanceStatus,
  type SessionRules,
} from '../attendance/decide.js';
import type { Rules } from '../courses/courses.repo.js';
import type { AttendanceCounts } from './reports.types.js';

type ReportSession = SessionRules & { startsAt: Date; endsAt: Date };

export interface NoRowContext {
  // เวลาที่เพิ่มเข้ารายชื่อ คาบที่เริ่มก่อนหน้านั้นไม่นับ
  addedAt?: Date | null;
  // คาบที่ไม่มีแถวของใครเลย กล้องไม่ได้ทำงาน บอกไม่ได้ว่าใครขาด
  sessionHasRows?: boolean;
}

export function statusWithoutRow(
  session: ReportSession,
  courseRules: Rules,
  now: Date,
  { addedAt = null, sessionHasRows = true }: NoRowContext = {},
): 'absent' | 'unrecorded' {
  if (!sessionHasRows || (addedAt && session.startsAt < addedAt)) return 'unrecorded';
  const rules = rulesFor(session, courseRules);
  return statusAt(now, session.startsAt, session.endsAt, rules) === 'absent'
    ? 'absent'
    : 'unrecorded';
}

// สถานะที่บันทึกไว้คือผลจริงของคาบนั้น เปลี่ยนเกณฑ์ทีหลังไม่กระทบย้อนหลัง
export function statusForReport(
  session: ReportSession,
  courseRules: Rules,
  attendance: { status: AttendanceStatus } | null,
  now: Date,
  context: NoRowContext = {},
): AttendanceStatus | 'unrecorded' {
  return attendance?.status ?? statusWithoutRow(session, courseRules, now, context);
}

// ยังไม่มีคาบที่ตัดสินผล (ไม่นับรอตรวจ) อัตราเข้าเรียนยังไม่มีความหมาย
export function hasDecided(counts: AttendanceCounts): boolean {
  return counts.total - counts.pending > 0;
}

// รอตรวจยังไม่รู้ผล จึงไม่นับเป็นตัวหาร
export function attendanceRate(counts: AttendanceCounts): number {
  const decided = counts.total - counts.pending;
  if (decided <= 0) return 0;
  const positive = counts.present + counts.late + counts.leave;
  return Math.round((positive / decided) * 1000) / 10;
}
