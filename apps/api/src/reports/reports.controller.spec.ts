import { describe, expect, it } from 'vitest';
import { ReportsController, StudentReportsController } from './reports.controller.js';
import type { ReportsService } from './reports.service.js';
import type { AppUser } from '../users/users.service.js';

describe('ReportsController', () => {
  it('ตอบ 400 เมื่อช่วงวันที่ไม่ถูกต้อง', async () => {
    const controller = new ReportsController({} as ReportsService);
    await expect(
      controller.getAttendanceReport({ role: 'teacher' } as AppUser, 'course-1', {
        startDate: '2026-10-31',
        endDate: '2026-10-01',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });
});

describe('StudentReportsController', () => {
  it('ส่งผู้ใช้ปัจจุบันไปดึงสรุปการเข้าเรียนของตนเอง', async () => {
    const summary = { summary: { attendanceRate: 80 }, courses: [] };
    const service = {
      getStudentAttendanceSummary: async () => summary,
    } as unknown as ReportsService;
    const controller = new StudentReportsController(service);
    const student = { id: 'student-1', role: 'student', studentId: '66123456' } as AppUser;

    await expect(controller.getAttendanceSummary(student)).resolves.toBe(summary);
  });
});
