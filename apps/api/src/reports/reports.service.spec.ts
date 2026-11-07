import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import type { CoursesService } from '../courses/courses.service.js';
import type { AppUser } from '../users/users.service.js';
import type { ReportsRepo } from './reports.repo.js';
import { ReportsService } from './reports.service.js';
import type {
  AttendanceFilterDto,
  AttendanceReportResponse,
} from './reports.types.js';

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

  const studentUser: AppUser = {
    ...teacherUser,
    id: 'student-1',
    email: '66123456@dpu.ac.th',
    role: 'student',
    studentId: '66123456',
  };

  const studentSummary = {
    summary: {
      counts: {
        present: 2,
        late: 1,
        absent: 1,
        leave: 0,
        pending: 0,
        total: 4,
      },
      attendanceRate: 75,
    },
    courses: [
      {
        course: {
          id: 'course-1',
          code: 'CS101',
          name: 'Intro to CS',
          section: null,
        },
        counts: {
          present: 2,
          late: 1,
          absent: 1,
          leave: 0,
          pending: 0,
          total: 4,
        },
        attendanceRate: 75,
      },
    ],
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
      getStudentAttendanceSummary: vi.fn().mockResolvedValue(studentSummary),
    };

    service = new ReportsService(
      mockCourses as CoursesService,
      mockRepo as ReportsRepo,
      () => mockNow,
    );
  });

  it('ดึงสรุปการเข้าเรียนเฉพาะรหัสนักศึกษาของผู้ใช้', async () => {
    const result = await service.getStudentAttendanceSummary(studentUser);

    expect(mockRepo.getStudentAttendanceSummary).toHaveBeenCalledWith(
      '66123456',
      mockNow,
    );
    expect(result).toEqual(studentSummary);
  });

  it('ไม่ดึงสรุปเมื่อผู้ใช้ไม่มีรหัสนักศึกษา', async () => {
    await expect(
      service.getStudentAttendanceSummary({ ...studentUser, studentId: null }),
    ).rejects.toMatchObject({ status: 403, code: 'STUDENT_ONLY' });
  });

  it('รายละเอียดรายวิชาคืนเฉพาะนักศึกษาปัจจุบัน แม้ส่งรหัสคนอื่นมา', async () => {
    const own = {
      studentCode: '66123456',
      fullName: null,
      userId: null,
      totalSessions: 0,
      attendanceRate: 0,
      sessions: [],
      counts: studentSummary.summary.counts,
    };
    vi.mocked(mockRepo.getAttendanceReport!).mockResolvedValue({
      ...sampleReport,
      students: [own, { ...own, studentCode: 'other' }],
    } as AttendanceReportResponse);
    const filter: AttendanceFilterDto = {
      kind: 'exam',
      startDate: '2026-10-01',
      studentCode: 'other',
    };
    const result = await service.getStudentCourseAttendance(
      studentUser,
      'course-1',
      filter,
    );
    expect(mockRepo.getAttendanceReport).toHaveBeenCalledWith(
      'course-1',
      {
        ...filter,
        studentCode: studentUser.studentId,
      },
      mockNow,
      true,
    );
    expect(result).toEqual({ course: sampleReport.course, student: own });
  });

  it('ปฏิเสธรายละเอียดของวิชาที่ไม่ได้ลงทะเบียน', async () => {
    await expect(
      service.getStudentCourseAttendance(studentUser, 'course-1', {
        kind: 'all',
      }),
    ).rejects.toMatchObject({ status: 404, code: 'COURSE_NOT_FOUND' });
  });

  it('ปฏิเสธรายละเอียดเมื่อผู้ใช้ไม่มีรหัสนักศึกษา', async () => {
    await expect(
      service.getStudentCourseAttendance(teacherUser, 'course-1', {
        kind: 'all',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'STUDENT_ONLY' });
    expect(mockRepo.getAttendanceReport).not.toHaveBeenCalled();
  });

  it('ดึงรายงานสำเร็จเมื่อเป็นอาจารย์ผู้สอน', async () => {
    const filter: AttendanceFilterDto = { kind: 'all' };
    const res = await service.getAttendanceReport(
      teacherUser,
      'course-1',
      filter,
    );

    expect(mockCourses.getOwned).toHaveBeenCalledWith(teacherUser, 'course-1');
    expect(mockRepo.getAttendanceReport).toHaveBeenCalledWith(
      'course-1',
      filter,
      mockNow,
    );
    expect(res.course.code).toBe('CS101');
    expect(res.summary.attendanceRate).toBe(100.0);
  });

  it('โยน 404 เมื่อไม่พบวิชาหรือไม่มีสิทธิ์', async () => {
    vi.mocked(mockCourses.getOwned!).mockRejectedValue(
      new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบรายวิชา'),
    );

    await expect(
      service.getAttendanceReport(teacherUser, 'invalid-course', {
        kind: 'all',
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'COURSE_NOT_FOUND',
    });
  });

  it('ส่งออก CSV พร้อมตั้งชื่อไฟล์ตามรหัสวิชาและวันที่', async () => {
    const { filename, content } = await service.exportCsv(
      teacherUser,
      'course-1',
      { kind: 'all' },
    );

    expect(filename).toContain('attendance-report-CS101-2026-10-28.csv');
    expect(content.startsWith('\uFEFF')).toBe(true);
  });

  it('ส่งออก PDF พร้อมคืน Buffer และชื่อไฟล์', async () => {
    const { filename, buffer } = await service.exportPdf(
      teacherUser,
      'course-1',
      { kind: 'all' },
    );

    expect(filename).toContain('attendance-report-CS101-2026-10-28.pdf');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('latin1').startsWith('%PDF-')).toBe(true);
  });

  it('ชื่อไฟล์ใช้วันที่เวลาไทย ไม่ใช่ UTC', async () => {
    // 29 ต.ค. 02:00 เวลาไทย = 28 ต.ค. 19:00 UTC
    const late = new ReportsService(
      mockCourses as CoursesService,
      mockRepo as ReportsRepo,
      () => new Date('2026-10-28T19:00:00Z'),
    );

    const csv = await late.exportCsv(teacherUser, 'course-1', { kind: 'all' });
    const pdf = await late.exportPdf(teacherUser, 'course-1', { kind: 'all' });

    expect(csv.filename).toBe('attendance-report-CS101-2026-10-29.csv');
    expect(pdf.filename).toBe('attendance-report-CS101-2026-10-29.pdf');
  });
});
