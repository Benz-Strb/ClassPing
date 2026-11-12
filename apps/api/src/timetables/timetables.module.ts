import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { SchedulesModule } from '../schedules/schedules.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import { TimetablesController } from './timetables.controller.js';
import { TimetablesService } from './timetables.service.js';
import { TimetablesRepo } from './timetables.repo.js';
import { TimetablePreviewLimitGuard } from './timetable-limit.guard.js';

@Module({
  imports: [CoursesModule, SchedulesModule, RoomsModule],
  controllers: [TimetablesController],
  providers: [
    TimetablesService,
    TimetablesRepo,
    LeaveOcrClient,
    TimetablePreviewLimitGuard,
    { provide: CLOCK, useValue: () => new Date() },
  ],
})
export class TimetablesModule {}
