import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { UsersModule } from '../users/users.module.js';
import { EnrollmentController } from './enrollment.controller.js';
import { ENROLLMENT_REPO, SupabaseEnrollmentRepo } from './enrollment.repo.js';
import { EnrollmentService } from './enrollment.service.js';
import { LeaveOcrClient } from '../leave/leave-ocr.client.js';

@Module({
  imports: [UsersModule],
  controllers: [EnrollmentController],
  providers: [
    EnrollmentService,
    LeaveOcrClient,
    { provide: ENROLLMENT_REPO, useClass: SupabaseEnrollmentRepo },
    { provide: CLOCK, useValue: () => new Date() },
  ],
})
export class EnrollmentModule {}
