import { Body, Controller, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { LeaveService, type LeaveEvidence } from './leave.service.js';

@Controller('leave-requests')
@Roles('student')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

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
}
