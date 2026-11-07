import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { CoursesService } from '../courses/courses.service.js';
import { DOOR_REPO, type DoorRepo } from '../door/door.repo.js';
import { outOfRoom } from '../door/out-of-room.js';
import { bangkokDate } from '../sessions/plan-day.js';
import type { AppUser } from '../users/users.service.js';
import { generateAttendanceCsv } from './export-csv.js';
import { generateAttendancePdf } from './export-pdf.js';
import { REPORTS_REPO, type ReportsRepo } from './reports.repo.js';
import type {
  AttendanceFilterDto,
  AttendanceReportResponse,
  StudentAttendanceSummaryResponse,
} from './reports.types.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly courses: CoursesService,
    @Inject(REPORTS_REPO) private readonly repo: ReportsRepo,
    @Inject(CLOCK) private readonly now: Clock,
    @Inject(DOOR_REPO) private readonly door: DoorRepo,
  ) {}

  async getStudentAttendanceSummary(
    user: AppUser,
  ): Promise<StudentAttendanceSummaryResponse> {
    if (!user.studentId) {
      throw new AppError(403, 'STUDENT_ONLY', 'ข้อมูลนี้ใช้ได้เฉพาะนักศึกษา');
    }
    return this.repo.getStudentAttendanceSummary(user.studentId, this.now());
  }

  async getAttendanceReport(
    user: AppUser,
    courseId: string,
    filter: AttendanceFilterDto,
  ): Promise<AttendanceReportResponse> {
    await this.verifyAccess(user, courseId);
    const report = await this.repo.getAttendanceReport(
      courseId,
      filter,
      this.now(),
    );
    if (!report) {
      throw new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบรายวิชานี้');
    }
    return this.withOutOfRoom(courseId, report);
  }

  async getStudentCourseAttendance(
    user: AppUser,
    courseId: string,
    filter: AttendanceFilterDto,
  ) {
    if (user.role !== 'student' || !user.studentId) {
      throw new AppError(403, 'STUDENT_ONLY', 'ข้อมูลนี้ใช้ได้เฉพาะนักศึกษา');
    }
    const report = await this.repo.getAttendanceReport(
      courseId,
      { ...filter, studentCode: user.studentId },
      this.now(),
      true,
    );
    const student = report?.students.find(
      (row) => row.studentCode === user.studentId,
    );
    if (!report || !student) {
      throw new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบรายวิชานี้');
    }
    const withTime = await this.withOutOfRoom(courseId, {
      ...report,
      students: [student],
    });
    return { course: report.course, student: withTime.students[0] };
  }

  // เวลานอกห้องใช้ตรรกะเดียวกับหน้าเช็คชื่อ: เฉพาะรอบที่ระบุตัวแล้ว นับเฉพาะส่วนที่อยู่ในคาบ
  private async withOutOfRoom(
    courseId: string,
    report: AttendanceReportResponse,
  ): Promise<AttendanceReportResponse> {
    const dates = report.sessions.map((s) => s.onDate).sort();
    const seconds = new Map<string, number>(); // `${sessionId}|${studentCode}`
    if (report.students.length > 0 && dates.length > 0) {
      const ids = new Set(report.sessions.map((s) => s.sessionId));
      const codes = new Set(report.students.map((s) => s.studentCode));
      const groups = new Map<string, Awaited<ReturnType<DoorRepo['courseTrips']>>>();
      for (const trip of await this.door.courseTrips(courseId, dates[0], dates[dates.length - 1])) {
        if (!ids.has(trip.sessionId) || !codes.has(trip.studentCode)) continue;
        const key = `${trip.sessionId}|${trip.studentCode}`;
        groups.set(key, [...(groups.get(key) ?? []), trip]);
      }
      const now = this.now();
      for (const [key, trips] of groups) {
        const { startsAt, endsAt } = trips[0];
        seconds.set(key, outOfRoom(trips, startsAt, endsAt, 0, now).totalSeconds);
      }
    }
    return {
      ...report,
      students: report.students.map((student) => {
        const sessions = student.sessions.map((session) => ({
          ...session,
          outOfRoomSeconds: seconds.get(`${session.sessionId}|${student.studentCode}`) ?? 0,
        }));
        return {
          ...student,
          sessions,
          outOfRoomSeconds: sessions.reduce((sum, s) => sum + s.outOfRoomSeconds, 0),
        };
      }),
    };
  }

  async exportCsv(
    user: AppUser,
    courseId: string,
    filter: AttendanceFilterDto,
  ): Promise<{ filename: string; content: string }> {
    const report = await this.getAttendanceReport(user, courseId, filter);
    const dateStr = bangkokDate(this.now());
    const filename = `attendance-report-${report.course.code}-${dateStr}.csv`;
    const content = generateAttendanceCsv(report);
    return { filename, content };
  }

  async exportPdf(
    user: AppUser,
    courseId: string,
    filter: AttendanceFilterDto,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const report = await this.getAttendanceReport(user, courseId, filter);
    const dateStr = bangkokDate(this.now());
    const filename = `attendance-report-${report.course.code}-${dateStr}.pdf`;
    const buffer = await generateAttendancePdf(report);
    return { filename, buffer };
  }

  private async verifyAccess(user: AppUser, courseId: string): Promise<void> {
    try {
      await this.courses.getOwned(user, courseId);
    } catch (error) {
      if (error instanceof AppError && error.getStatus() === 404) {
        throw new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบรายวิชานี้');
      }
      throw error;
    }
  }
}
