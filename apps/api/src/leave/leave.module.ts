import { Module } from '@nestjs/common';
import { FaceModule } from '../face/face.module.js';
import { LeaveController } from './leave.controller.js';
import { LEAVE_REPO, SupabaseLeaveRepo } from './leave.repo.js';
import { LeaveService } from './leave.service.js';

@Module({
  imports: [FaceModule],
  controllers: [LeaveController],
  providers: [LeaveService, { provide: LEAVE_REPO, useClass: SupabaseLeaveRepo }],
})
export class LeaveModule {}
