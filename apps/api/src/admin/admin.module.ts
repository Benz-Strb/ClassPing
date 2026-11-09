import { ChatModule } from '../chat/chat.module.js';
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { ADMIN_REPO, SupabaseAdminRepo } from './admin.repo.js';
import { AdminService } from './admin.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CurriculaController } from './curricula.controller.js';
import { CATALOG_REPO, SupabaseCatalogRepo } from './catalog.repo.js';

@Module({
  imports: [ChatModule],
  controllers: [AdminController, CatalogController, CurriculaController],
  providers: [
    AdminService,
    CatalogService,
    { provide: CATALOG_REPO, useClass: SupabaseCatalogRepo },
    { provide: ADMIN_REPO, useClass: SupabaseAdminRepo },
  ],
})
export class AdminModule {}
