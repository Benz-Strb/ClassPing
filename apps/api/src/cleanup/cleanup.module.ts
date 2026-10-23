import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { CLEANUP_REPO, SupabaseCleanupRepo } from './cleanup.repo.js';
import { OrphanFilesRunner } from './orphan-files.runner.js';

@Module({
  providers: [
    OrphanFilesRunner,
    { provide: CLEANUP_REPO, useClass: SupabaseCleanupRepo },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [OrphanFilesRunner],
})
export class CleanupModule {}
