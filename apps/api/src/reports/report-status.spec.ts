import { describe, expect, it } from 'vitest';
import type { Rules } from '../courses/courses.repo.js';
import { statusForReport } from './report-status.js';

const courseRules: Rules = {
  lateAfterMin: 15,
  absentAfterMin: 60,
  outOfRoomLimitMin: 15,
};
const times = {
  startsAt: new Date('2026-10-30T09:00:00Z'),
  endsAt: new Date('2026-10-30T12:00:00Z'),
};

describe('statusForReport', () => {
  it('ใช้เกณฑ์วิชากับคาบเรียน และเกณฑ์ในแถวคาบกับคาบสอบ', () => {
    const attendance = {
      status: 'present' as const,
      firstSeenAt: new Date('2026-10-30T09:10:00Z'),
      updatedBy: null,
    };

    expect(
      statusForReport(
        { ...times, kind: 'class', lateAfterMin: null, absentAfterMin: null },
        courseRules,
        attendance,
        new Date('2026-10-30T09:31:00Z'),
      ),
    ).toBe('present');
    expect(
      statusForReport(
        { ...times, kind: 'exam', lateAfterMin: 5, absentAfterMin: 30 },
        courseRules,
        attendance,
        new Date('2026-10-30T09:31:00Z'),
      ),
    ).toBe('late');
  });

  it('นับผู้ไม่มีบันทึกเป็นขาดตาม absent_after_min ของคาบสอบ', () => {
    const now = new Date('2026-10-30T09:31:00Z');

    expect(
      statusForReport(
        { ...times, kind: 'class', lateAfterMin: null, absentAfterMin: null },
        courseRules,
        null,
        now,
      ),
    ).toBe('unrecorded');
    expect(
      statusForReport(
        { ...times, kind: 'exam', lateAfterMin: 5, absentAfterMin: 30 },
        courseRules,
        null,
        now,
      ),
    ).toBe('absent');
  });

  it('รอจนหมดคาบก่อนนับขาด เมื่อ absent_after_min เป็นค่าว่าง', () => {
    const exam = {
      ...times,
      kind: 'exam' as const,
      lateAfterMin: 10,
      absentAfterMin: null,
    };

    expect(
      statusForReport(
        exam,
        courseRules,
        null,
        new Date('2026-10-30T11:59:59Z'),
      ),
    ).toBe('unrecorded');
    expect(statusForReport(exam, courseRules, null, times.endsAt)).toBe(
      'absent',
    );
  });
});
