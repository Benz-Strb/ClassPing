import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { AppError } from '../common/app-error.js';
import type { AppUser } from '../users/users.service.js';
import { LeaveService, MAX_EVIDENCE_BYTES, type LeaveEvidence } from './leave.service.js';

@Controller('leave-requests')
@Roles('student')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('mine')
  @Roles('student')
  listMine(@CurrentUser() user: AppUser) {
    return this.leave.listMine(user);
  }

  @Get('statuses')
  @Roles('admin')
  listStatuses(@CurrentUser() user: AppUser) {
    return this.leave.listStatuses(user);
  }

  @Get('sessions')
  @Roles('student')
  listSessions(@CurrentUser() user: AppUser) {
    return this.leave.listSessions(user);
  }

  @Get('review')
  @Roles('teacher')
  listForTeacher(@CurrentUser() user: AppUser) {
    return this.leave.listForTeacher(user);
  }

  @Get('pending')
  @Roles('teacher')
  listPending(@CurrentUser() user: AppUser) {
    return this.leave.listPending(user);
  }

  @Get(':id/evidence')
  @Roles('student', 'teacher')
  evidence(@CurrentUser() user: AppUser, @Param('id') id: string) {
    return this.leave.evidenceUrl(user, id);
  }

  @Post('preview')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('evidence', { limits: { fileSize: MAX_EVIDENCE_BYTES } }),
  )
  preview(
    @CurrentUser() user: AppUser,
    @Body('sessionId') sessionId: string,
    @UploadedFile() evidence?: LeaveEvidence,
  ) {
    return this.leave.preview(user, sessionId, evidence);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('evidence', { limits: { fileSize: MAX_EVIDENCE_BYTES } }),
  )
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
      throw new AppError(
        400,
        'BAD_REQUEST',
        'decision ต้องเป็น approved หรือ rejected',
      );
    }
    return this.leave.review(user, id, decision, reviewNote);
  }
}
