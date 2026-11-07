import { describe, expect, it } from 'vitest';
import type { Rules } from '../courses/courses.repo.js';
import { attendanceRate, statusForReport } from './report-status.js';

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
  it('คงผลรอตรวจไว้แม้หมดคาบ', () => {
    expect(
      statusForReport(
        { ...times, kind: 'exam', lateAfterMin: 5, absentAfterMin: 30, outOfRoomLimitMin: null },
        courseRules,
        { status: 'pending' },
        new Date('2026-10-31T00:00:00Z'),
      ),
    ).toBe('pending');
  });

  it('ใช้สถานะที่บันทึกไว้ เปลี่ยนเกณฑ์ทีหลังผลไม่เปลี่ยน', () => {
    const later = new Date('2026-11-05T00:00:00Z');
    const session = {
      ...times,
      kind: 'class' as const,
      lateAfterMin: null,
      absentAfterMin: null,
      outOfRoomLimitMin: null,
    };
    expect(statusForReport(session, { ...courseRules, lateAfterMin: 60 }, { status: 'late' }, later)).toBe('late');
    expect(statusForReport(session, { ...courseRules, lateAfterMin: 1 }, { status: 'present' }, later)).toBe('present');
  });

  it('คนที่เพิ่มหลังคาบเริ่มไม่นับขาดในคาบนั้น แต่คาบหลังจากนั้นนับ', () => {
    const session = {
      ...times,
      kind: 'class' as const,
      lateAfterMin: null,
      absentAfterMin: null,
      outOfRoomLimitMin: null,
    };
    const after = new Date('2026-11-05T00:00:00Z');
    expect(
      statusForReport(session, courseRules, null, after, {
        addedAt: new Date('2026-10-30T09:30:00Z'),
      }),
    ).toBe('unrecorded');
    expect(
      statusForReport(session, courseRules, null, after, {
        addedAt: new Date('2026-10-30T08:00:00Z'),
      }),
    ).toBe('absent');
  });

  it('คาบที่ไม่มีแถวของใครเลยไม่นับขาดทั้งห้อง', () => {
    const session = {
      ...times,
      kind: 'class' as const,
      lateAfterMin: null,
      absentAfterMin: null,
      outOfRoomLimitMin: null,
    };
    expect(
      statusForReport(session, courseRules, null, new Date('2026-11-05T00:00:00Z'), {
        sessionHasRows: false,
      }),
    ).toBe('unrecorded');
  });

  it('อัตราเข้าเรียนไม่นับรอตรวจเป็นตัวหาร', () => {
    expect(
      attendanceRate({ present: 8, late: 0, absent: 0, leave: 0, pending: 2, total: 10 }),
    ).toBe(100);
    expect(
      attendanceRate({ present: 6, late: 1, absent: 1, leave: 1, pending: 1, total: 10 }),
    ).toBe(88.9);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, leave: 0, pending: 2, total: 2 })).toBe(0);
  });

  it('นับผู้ไม่มีบันทึกเป็นขาดตาม absent_after_min ของคาบสอบ', () => {
    const now = new Date('2026-10-30T09:31:00Z');

    expect(
      statusForReport(
        { ...times, kind: 'class', lateAfterMin: null, absentAfterMin: null, outOfRoomLimitMin: null },
        courseRules,
        null,
        now,
      ),
    ).toBe('unrecorded');
    expect(
      statusForReport(
        { ...times, kind: 'exam', lateAfterMin: 5, absentAfterMin: 30, outOfRoomLimitMin: null },
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
      outOfRoomLimitMin: null,
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
