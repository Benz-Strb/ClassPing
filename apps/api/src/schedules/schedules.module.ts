import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { SchedulesController } from './schedules.controller.js';
import { SCHEDULES_REPO, SupabaseSchedulesRepo } from './schedules.repo.js';
import { SchedulesService, SESSION_SYNCER, type SessionSyncer } from './schedules.service.js';

// ยังไม่สร้างคาบจนกว่าจะมี SessionsService (Task 5)
const noSync: SessionSyncer = { syncCourse: async () => {} };

@Module({
  imports: [CoursesModule, RoomsModule],
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    { provide: SCHEDULES_REPO, useClass: SupabaseSchedulesRepo },
    { provide: SESSION_SYNCER, useValue: noSync },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [SCHEDULES_REPO],
})
export class SchedulesModule {}
