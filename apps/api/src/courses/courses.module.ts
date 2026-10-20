import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { COURSES_REPO, SupabaseCoursesRepo } from './courses.repo.js';
import { CoursesService } from './courses.service.js';
import { ROSTER_REPO, SupabaseRosterRepo } from './roster.repo.js';
import { RosterService } from './roster.service.js';

@Module({
  controllers: [CoursesController],
  providers: [
    CoursesService,
    RosterService,
    { provide: COURSES_REPO, useClass: SupabaseCoursesRepo },
    { provide: ROSTER_REPO, useClass: SupabaseRosterRepo },
  ],
  exports: [CoursesService, RosterService],
})
export class CoursesModule {}
