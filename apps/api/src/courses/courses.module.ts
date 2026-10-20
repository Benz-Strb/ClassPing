import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { COURSES_REPO, SupabaseCoursesRepo } from './courses.repo.js';
import { CoursesService } from './courses.service.js';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, { provide: COURSES_REPO, useClass: SupabaseCoursesRepo }],
  exports: [CoursesService],
})
export class CoursesModule {}
