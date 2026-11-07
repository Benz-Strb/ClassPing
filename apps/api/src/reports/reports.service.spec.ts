import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import type { CoursesService } from '../courses/courses.service.js';
import type { AppUser } from '../users/users.service.js';
import type { CourseTrip, DoorRepo } from '../door/door.repo.js';
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
  let courseTrips: ReturnType<typeof vi.fn>;
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

    courseTrips = vi.fn().mockResolvedValue([]);
    service = new ReportsService(
      mockCourses as CoursesService,
      mockRepo as ReportsRepo,
      () => mockNow,
      { courseTrips } as unknown as DoorRepo,
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
      outOfRoomSeconds: 0,
      sessions: [],
      counts: studentSummary.summary.counts,
    };
    vi.mocked(mockRepo.getAttendanceReport!).mockResolvedValue({
      ...sampleReport,
      students: [own, { ...own, studentCode: 'other' }],
    } as unknown as AttendanceReportResponse);
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
      { courseTrips } as unknown as DoorRepo,
    );

    const csv = await late.exportCsv(teacherUser, 'course-1', { kind: 'all' });
    const pdf = await late.exportPdf(teacherUser, 'course-1', { kind: 'all' });

    expect(csv.filename).toBe('attendance-report-CS101-2026-10-29.csv');
    expect(pdf.filename).toBe('attendance-report-CS101-2026-10-29.pdf');
  });

  describe('เวลานอกห้อง', () => {
    const counts = { present: 1, late: 0, absent: 0, leave: 0, pending: 0, total: 1 };
    const session = (id: string, onDate: string, startsAt: string, endsAt: string) => ({
      sessionId: id,
      onDate,
      startsAt,
      endsAt,
      kind: 'class' as const,
      title: null,
      status: 'present' as const,
    });
    const student = (code: string, sessions: ReturnType<typeof session>[]) => ({
      studentCode: code,
      fullName: null,
      userId: null,
      counts,
      totalSessions: sessions.length,
      attendanceRate: 100,
      outOfRoomSeconds: 0,
      sessions,
    });
    const s1 = session('s1', '2026-10-26', '2026-10-26T02:00:00Z', '2026-10-26T05:00:00Z');
    const s2 = session('s2', '2026-10-27', '2026-10-27T02:00:00Z', '2026-10-27T05:00:00Z');
    const trip = (sessionId: string, studentCode: string, outAt: string, backAt: string | null, s = s1) =>
      ({
        sessionId,
        onDate: s.onDate,
        kind: 'class',
        startsAt: new Date(s.startsAt),
        endsAt: new Date(s.endsAt),
        lateAfterMin: null,
        absentAfterMin: null,
        outOfRoomLimitMin: null,
        studentCode,
        outAt: new Date(outAt),
        backAt: backAt ? new Date(backAt) : null,
      }) as CourseTrip;
    const reportOf = (students: ReturnType<typeof student>[]) =>
      ({
        ...sampleReport,
        sessions: [s1, s2].map((x) => ({ ...x, roomName: 'R', counts })),
        students,
      }) as unknown as AttendanceReportResponse;

    it('รวมวินาทีนอกห้องต่อคาบและต่อนักศึกษา เฉพาะส่วนที่อยู่ในคาบ', async () => {
      vi.mocked(mockRepo.getAttendanceReport!).mockResolvedValue(
        reportOf([student('66000001', [s1, s2]), student('66000002', [s1, s2])]),
      );
      courseTrips.mockResolvedValue([
        // ออกก่อนคาบเริ่ม 10 นาที กลับหลังเริ่ม 20 นาที: นับ 20 นาที
        trip('s1', '66000001', '2026-10-26T01:50:00Z', '2026-10-26T02:20:00Z'),
        trip('s1', '66000001', '2026-10-26T03:00:00Z', '2026-10-26T03:10:00Z'),
        trip('s2', '66000001', '2026-10-27T03:00:00Z', '2026-10-27T03:05:00Z', s2),
        // รอบที่เลยไปแล้วไม่อยู่ในคาบ
        trip('s1', '66000002', '2026-10-26T00:00:00Z', '2026-10-26T01:00:00Z'),
        // คาบที่ไม่อยู่ในรายงาน และนักศึกษาที่ไม่อยู่ในรายงาน
        trip('other', '66000001', '2026-10-26T03:00:00Z', '2026-10-26T04:00:00Z'),
        trip('s1', '66999999', '2026-10-26T03:00:00Z', '2026-10-26T04:00:00Z'),
      ]);

      const result = await service.getAttendanceReport(teacherUser, 'course-1', { kind: 'all' });

      expect(courseTrips).toHaveBeenCalledWith('course-1', '2026-10-26', '2026-10-27');
      const [a, b] = result.students;
      expect(a.sessions.map((x) => x.outOfRoomSeconds)).toEqual([30 * 60, 5 * 60]);
      expect(a.outOfRoomSeconds).toBe(35 * 60);
      expect(b.outOfRoomSeconds).toBe(0);
    });

    it('รอบที่ยังไม่กลับนับถึงตอนนี้ ไม่เกินหมดคาบ', async () => {
      vi.mocked(mockRepo.getAttendanceReport!).mockResolvedValue(
        reportOf([student('66000001', [s1, s2])]),
      );
      // ตอนนี้ 2026-10-28 เลยทั้งสองคาบแล้ว: นับถึงหมดคาบ 05:00
      courseTrips.mockResolvedValue([trip('s1', '66000001', '2026-10-26T04:30:00Z', null)]);

      const result = await service.getAttendanceReport(teacherUser, 'course-1', { kind: 'all' });

      expect(result.students[0].outOfRoomSeconds).toBe(30 * 60);
    });

    it('นักศึกษาเห็นเฉพาะของตัวเองต่อคาบและรวม', async () => {
      const own = student('66123456', [s1, s2]);
      vi.mocked(mockRepo.getAttendanceReport!).mockResolvedValue(
        reportOf([own, student('other', [s1, s2])]),
      );
      courseTrips.mockResolvedValue([
        trip('s1', '66123456', '2026-10-26T03:00:00Z', '2026-10-26T03:10:00Z'),
        trip('s1', 'other', '2026-10-26T03:00:00Z', '2026-10-26T04:00:00Z'),
      ]);

      const result = await service.getStudentCourseAttendance(studentUser, 'course-1', { kind: 'all' });

      expect(result.student.outOfRoomSeconds).toBe(600);
      expect(result.student.sessions[0].outOfRoomSeconds).toBe(600);
      expect(result.student.sessions[1].outOfRoomSeconds).toBe(0);
      expect(JSON.stringify(result)).not.toContain('other');
    });

    it('ไม่มีคาบหรือไม่มีนักศึกษา ไม่เรียกฐานข้อมูลรอบนอกห้อง', async () => {
      await service.getAttendanceReport(teacherUser, 'course-1', { kind: 'all' });
      expect(courseTrips).not.toHaveBeenCalled();
    });
  });
});
