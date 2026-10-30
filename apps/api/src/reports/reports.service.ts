import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { CoursesService } from '../courses/courses.service.js';
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
  ) {}

  async getStudentAttendanceSummary(user: AppUser): Promise<StudentAttendanceSummaryResponse> {
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
    const report = await this.repo.getAttendanceReport(courseId, filter, this.now());
    if (!report) {
      throw new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบรายวิชานี้');
    }
    return report;
  }

  async exportCsv(
    user: AppUser,
    courseId: string,
    filter: AttendanceFilterDto,
  ): Promise<{ filename: string; content: string }> {
    const report = await this.getAttendanceReport(user, courseId, filter);
    const dateStr = this.now().toISOString().slice(0, 10);
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
    const dateStr = this.now().toISOString().slice(0, 10);
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
