import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { EnrollmentController } from './enrollment.controller.js';
import { ENROLLMENT_REPO, SupabaseEnrollmentRepo } from './enrollment.repo.js';
import { EnrollmentService } from './enrollment.service.js';

@Module({
  imports: [UsersModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, { provide: ENROLLMENT_REPO, useClass: SupabaseEnrollmentRepo }],
})
export class EnrollmentModule {}
