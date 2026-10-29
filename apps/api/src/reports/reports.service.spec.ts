import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import type { CoursesService } from '../courses/courses.service.js';
import type { AppUser } from '../users/users.service.js';
import type { ReportsRepo } from './reports.repo.js';
import { ReportsService } from './reports.service.js';
import type { AttendanceFilterDto, AttendanceReportResponse } from './reports.types.js';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockCourses: Partial<CoursesService>;
  let mockRepo: Partial<ReportsRepo>;
  const mockNow = new Date('2026-10-28T12:00:00Z');

  const teacherUser: AppUser = {
    id: 'teacher-1',
    email: 'teacher@test.ac.th',
    fullName: 'อาจารย์ทดสอบ',
    role: 'teacher',
    studentId: null,
    pdpaConsentAt: null,
    identityVerifiedAt: null,
  };

  const sampleReport: AttendanceReportResponse = {
    course: {
      id: 'course-1',
      code: 'CS101',
      name: 'Intro to CS',
      section: null,
    },
    filter: { kind: 'all' },
    summary: {
      totalSessions: 1,
      totalStudents: 1,
      counts: {
        present: 1,
        late: 0,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 1,
      },
      attendanceRate: 100.0,
    },
    sessions: [],
    students: [],
  };

  beforeEach(() => {
    mockCourses = {
      getOwned: vi.fn().mockResolvedValue({
        id: 'course-1',
        code: 'CS101',
        name: 'Intro to CS',
      }),
    };

    mockRepo = {
      getAttendanceReport: vi.fn().mockResolvedValue(sampleReport),
    };

    service = new ReportsService(
      mockCourses as CoursesService,
      mockRepo as ReportsRepo,
      () => mockNow,
    );
  });

  it('ดึงรายงานสำเร็จเมื่อเป็นอาจารย์ผู้สอน', async () => {
    const filter: AttendanceFilterDto = { kind: 'all' };
    const res = await service.getAttendanceReport(teacherUser, 'course-1', filter);

    expect(mockCourses.getOwned).toHaveBeenCalledWith(teacherUser, 'course-1');
    expect(mockRepo.getAttendanceReport).toHaveBeenCalledWith('course-1', filter, mockNow);
    expect(res.course.code).toBe('CS101');
    expect(res.summary.attendanceRate).toBe(100.0);
  });

  it('โยน 404 เมื่อไม่พบวิชาหรือไม่มีสิทธิ์', async () => {
    vi.mocked(mockCourses.getOwned!).mockRejectedValue(new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบรายวิชา'));

    await expect(
      service.getAttendanceReport(teacherUser, 'invalid-course', { kind: 'all' }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'COURSE_NOT_FOUND',
    });
  });

  it('ส่งออก CSV พร้อมตั้งชื่อไฟล์ตามรหัสวิชาและวันที่', async () => {
    const { filename, content } = await service.exportCsv(teacherUser, 'course-1', { kind: 'all' });

    expect(filename).toContain('attendance-report-CS101-2026-10-28.csv');
    expect(content.startsWith('\uFEFF')).toBe(true);
  });

  it('ส่งออก PDF พร้อมคืน Buffer และชื่อไฟล์', async () => {
    const { filename, buffer } = await service.exportPdf(teacherUser, 'course-1', { kind: 'all' });

    expect(filename).toContain('attendance-report-CS101-2026-10-28.pdf');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
  });
});
