import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { parseBody } from '../common/validate.js';
import { ReportsService } from './reports.service.js';
import { attendanceFilterSchema, type AttendanceReportResponse } from './reports.types.js';

@Controller('courses/:courseId/reports')
@Roles('teacher', 'admin')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  async getAttendanceReport(
    @CurrentUser() user: AppUser,
    @Param('courseId') courseId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<AttendanceReportResponse> {
    const filter = parseBody(attendanceFilterSchema, query);
    return this.reportsService.getAttendanceReport(user, courseId, filter);
  }

  @Get('attendance/csv')
  async exportCsv(
    @CurrentUser() user: AppUser,
    @Param('courseId') courseId: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const filter = parseBody(attendanceFilterSchema, query);
    const { filename, content } = await this.reportsService.exportCsv(user, courseId, filter);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(content);
  }

  @Get('attendance/pdf')
  async exportPdf(
    @CurrentUser() user: AppUser,
    @Param('courseId') courseId: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const filter = parseBody(attendanceFilterSchema, query);
    const { filename, buffer } = await this.reportsService.exportPdf(user, courseId, filter);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}

@Controller('me/reports')
@Roles('student')
export class StudentReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  getAttendanceSummary(@CurrentUser() user: AppUser) {
    return this.reportsService.getStudentAttendanceSummary(user);
  }
}
