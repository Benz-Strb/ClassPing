import { Module } from '@nestjs/common';
import { FaceModule } from '../face/face.module.js';
import { CLOCK } from '../common/clock.js';
import { LeaveController } from './leave.controller.js';
import { LEAVE_REPO, SupabaseLeaveRepo } from './leave.repo.js';
import { PreviewLimitGuard } from './preview-limit.guard.js';
import { LeaveService } from './leave.service.js';

@Module({
  imports: [FaceModule],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    PreviewLimitGuard,
    { provide: CLOCK, useValue: () => new Date() },
    { provide: LEAVE_REPO, useClass: SupabaseLeaveRepo },
  ],
})
export class LeaveModule {}
