import { Module } from '@nestjs/common';
import { ATTENDANCE_REPO, SupabaseAttendanceRepo } from '../attendance/attendance.repo.js';
import type { FrameDeps } from '../attendance/frame.processor.js';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { RosterService } from '../courses/roster.service.js';
import { FaceClient } from '../face/face.client.js';
import { DoorEntries } from './door-entries.js';
import { DOOR_DEPS, DoorProcessor } from './door.processor.js';
import { DOOR_REPO, SupabaseDoorRepo } from './door.repo.js';
import { OpenTrips } from './open-trips.js';

// ห้าม import AttendanceModule: AttendanceModule เป็นฝ่าย import โมดูลนี้
@Module({
  imports: [CoursesModule],
  providers: [
    DoorProcessor,
    OpenTrips,
    DoorEntries,
    { provide: DOOR_REPO, useClass: SupabaseDoorRepo },
    { provide: ATTENDANCE_REPO, useClass: SupabaseAttendanceRepo },
    {
      provide: DOOR_DEPS,
      inject: [FaceClient, RosterService],
      useFactory: (face: FaceClient, roster: RosterService): FrameDeps => ({
        detect: (image, mime, opts) => face.detect(image, mime, opts),
        model: () => face.model(),
        enrolledUserIds: (courseId) => roster.enrolledUserIds(courseId),
      }),
    },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [DoorProcessor, OpenTrips, DoorEntries, DOOR_REPO],
})
export class DoorModule {}
