import { Body, Controller, Get, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { LeaveService, type LeaveEvidence } from './leave.service.js';

@Controller('leave-requests')
@Roles('student')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('mine')
  @Roles('student')
  listMine(@CurrentUser() user: AppUser) {
    return this.leave.listMine(user);
  }

  @Get('review')
  @Roles('teacher')
  listForTeacher(@CurrentUser() user: AppUser) {
    return this.leave.listForTeacher(user);
  }

  @Get(':id/evidence')
  @Roles('student', 'teacher')
  evidence(@CurrentUser() user: AppUser, @Param('id') id: string) {
    return this.leave.evidenceUrl(user, id);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: 10 * 1024 * 1024 } }))
  submit(
    @CurrentUser() user: AppUser,
    @Body('sessionId') sessionId: string,
    @Body('reason') reason: string,
    @UploadedFile() evidence?: LeaveEvidence,
  ) {
    return this.leave.submit(user, sessionId, reason, evidence);
  }

  @Post(':id/review')
  @HttpCode(200)
  @Roles('teacher')
  review(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body('decision') decision: 'approved' | 'rejected',
    @Body('reviewNote') reviewNote?: string,
  ) {
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new Error('decision ต้องเป็น approved หรือ rejected');
    }
    return this.leave.review(user, id, decision, reviewNote);
  }
}
