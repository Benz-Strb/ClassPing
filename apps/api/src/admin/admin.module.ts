import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { ADMIN_REPO, SupabaseAdminRepo } from './admin.repo.js';
import { AdminService } from './admin.service.js';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    { provide: ADMIN_REPO, useClass: SupabaseAdminRepo },
  ],
})
export class AdminModule {}
