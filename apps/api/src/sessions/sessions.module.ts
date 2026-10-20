import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { SCHEDULES_REPO, SupabaseSchedulesRepo } from '../schedules/schedules.repo.js';
import { SessionSyncRunner } from './session-sync.runner.js';
import { SessionsController } from './sessions.controller.js';
import { SESSIONS_REPO, SupabaseSessionsRepo } from './sessions.repo.js';
import { SessionsService } from './sessions.service.js';

// ไม่ import SchedulesModule เพราะจะวนกัน
@Module({
  imports: [CoursesModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    SessionSyncRunner,
    { provide: SESSIONS_REPO, useClass: SupabaseSessionsRepo },
    { provide: SCHEDULES_REPO, useClass: SupabaseSchedulesRepo },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [SessionsService, SessionSyncRunner],
})
export class SessionsModule {}
