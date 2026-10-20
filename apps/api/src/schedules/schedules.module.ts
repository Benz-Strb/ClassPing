import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { SchedulesController } from './schedules.controller.js';
import { SCHEDULES_REPO, SupabaseSchedulesRepo } from './schedules.repo.js';
import { SchedulesService, SESSION_SYNCER } from './schedules.service.js';

@Module({
  imports: [CoursesModule, RoomsModule, SessionsModule],
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    { provide: SCHEDULES_REPO, useClass: SupabaseSchedulesRepo },
    { provide: SESSION_SYNCER, useExisting: SessionsService },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [SCHEDULES_REPO],
})
export class SchedulesModule {}
