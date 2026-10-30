import {
  rulesFor,
  statusAt,
  type AttendanceStatus,
  type SessionRules,
} from '../attendance/decide.js';
import type { Rules } from '../courses/courses.repo.js';

export interface ReportAttendance {
  status: AttendanceStatus;
  firstSeenAt: Date | null;
  updatedBy: string | null;
}

export function statusForReport(
  session: SessionRules & { startsAt: Date; endsAt: Date },
  courseRules: Rules,
  attendance: ReportAttendance | null,
  now: Date,
): AttendanceStatus | 'unrecorded' {
  const sessionRules = rulesFor(session, courseRules);
  if (!attendance) {
    return statusAt(now, session.startsAt, session.endsAt, sessionRules) ===
      'absent'
      ? 'absent'
      : 'unrecorded';
  }

  if (
    attendance.status === 'leave' ||
    attendance.status === 'pending' ||
    attendance.firstSeenAt === null ||
    attendance.updatedBy !== null
  ) {
    return attendance.status;
  }
  return statusAt(
    attendance.firstSeenAt,
    session.startsAt,
    session.endsAt,
    sessionRules,
  );
}
