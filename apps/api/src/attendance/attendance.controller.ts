import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { AttendanceService, type SessionAttendance } from './attendance.service.js';

@Controller('sessions/:id/attendance')
@Roles('teacher')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  view(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<SessionAttendance> {
    return this.attendance.view(user, id);
  }

  @Patch(':code')
  setStatus(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<SessionAttendance> {
    return this.attendance.setStatus(user, id, code, body);
  }

  @Post(':code/review')
  @HttpCode(200)
  review(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<SessionAttendance> {
    return this.attendance.review(user, id, code, body);
  }
}
