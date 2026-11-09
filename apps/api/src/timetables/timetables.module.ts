import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { SchedulesModule } from '../schedules/schedules.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import { TimetablesController } from './timetables.controller.js';
import { TimetablesService } from './timetables.service.js';
import { TimetablesRepo } from './timetables.repo.js';

@Module({
  imports: [CoursesModule, SchedulesModule, RoomsModule],
  controllers: [TimetablesController],
  providers: [TimetablesService, TimetablesRepo, LeaveOcrClient],
})
export class TimetablesModule {}
