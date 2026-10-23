import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { RosterService } from '../courses/roster.service.js';
import { FaceClient } from '../face/face.client.js';
import { ATTENDANCE_ADMIN_REPO, SupabaseAttendanceAdminRepo } from './attendance-admin.repo.js';
import { AttendanceController } from './attendance.controller.js';
import { ATTENDANCE_REPO, SupabaseAttendanceRepo } from './attendance.repo.js';
import { AttendanceService } from './attendance.service.js';
import { FRAME_DEPS, FrameProcessor, type FrameDeps } from './frame.processor.js';
import { FrameWorker } from './frame.worker.js';
import { UnknownCleanupRunner } from './unknown-cleanup.runner.js';

@Module({
  imports: [CoursesModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    FrameProcessor,
    FrameWorker,
    UnknownCleanupRunner,
    { provide: ATTENDANCE_REPO, useClass: SupabaseAttendanceRepo },
    { provide: ATTENDANCE_ADMIN_REPO, useClass: SupabaseAttendanceAdminRepo },
    {
      provide: FRAME_DEPS,
      inject: [FaceClient, RosterService],
      useFactory: (face: FaceClient, roster: RosterService): FrameDeps => ({
        detect: (image, mime, opts) => face.detect(image, mime, opts),
        model: () => face.model(),
        enrolledUserIds: (courseId) => roster.enrolledUserIds(courseId),
      }),
    },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [FrameWorker, UnknownCleanupRunner],
})
export class AttendanceModule {}
