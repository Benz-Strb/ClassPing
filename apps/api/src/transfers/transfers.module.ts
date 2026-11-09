import { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { TransfersController } from './transfers.controller.js';
import { SupabaseTransfersRepo, TRANSFERS_REPO } from './transfers.repo.js';
import { TransfersService } from './transfers.service.js';
@Module({
  imports: [SupabaseModule],
  controllers: [TransfersController],
  providers: [
    TransfersService,
    LeaveOcrClient,
    { provide: TRANSFERS_REPO, useClass: SupabaseTransfersRepo },
  ],
})
export class TransfersModule {}
