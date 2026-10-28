import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CoursesModule } from '../courses/courses.module.js';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { ReportsController } from './reports.controller.js';
import { SupabaseReportsRepo, REPORTS_REPO } from './reports.repo.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [CoursesModule, SupabaseModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: REPORTS_REPO, useClass: SupabaseReportsRepo },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
