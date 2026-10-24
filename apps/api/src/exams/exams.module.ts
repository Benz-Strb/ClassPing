import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { SchedulesModule } from '../schedules/schedules.module.js';
import { ExamsController } from './exams.controller.js';
import { EXAMS_REPO, SupabaseExamsRepo } from './exams.repo.js';
import { ExamsService } from './exams.service.js';

@Module({
  imports: [CoursesModule, RoomsModule, SchedulesModule],
  controllers: [ExamsController],
  providers: [
    ExamsService,
    { provide: EXAMS_REPO, useClass: SupabaseExamsRepo },
    { provide: CLOCK, useValue: () => new Date() },
  ],
})
export class ExamsModule {}
