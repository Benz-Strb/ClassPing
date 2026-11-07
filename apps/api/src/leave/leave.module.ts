import { Module } from '@nestjs/common';
import { LeaveOcrClient } from './leave-ocr.client.js';
import { LeaveController } from './leave.controller.js';
import { LEAVE_REPO, SupabaseLeaveRepo } from './leave.repo.js';
import { LeaveService } from './leave.service.js';

@Module({
  controllers: [LeaveController],
  providers: [LeaveOcrClient, LeaveService, { provide: LEAVE_REPO, useClass: SupabaseLeaveRepo }],
})
export class LeaveModule {}
