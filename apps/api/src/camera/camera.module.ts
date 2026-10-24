import { Module } from '@nestjs/common';
import { BullFrameQueue, FRAME_QUEUE } from '../attendance/frame-queue.js';
import { CLOCK } from '../common/clock.js';
import { CameraController } from './camera.controller.js';
import { CameraGuard } from './camera.guard.js';
import { CAMERA_REPO, SupabaseCameraRepo } from './camera.repo.js';
import { CameraService } from './camera.service.js';

@Module({
  controllers: [CameraController],
  providers: [
    CameraService,
    CameraGuard,
    { provide: CAMERA_REPO, useClass: SupabaseCameraRepo },
    { provide: FRAME_QUEUE, useClass: BullFrameQueue },
    { provide: CLOCK, useValue: () => new Date() },
  ],
  exports: [CameraService, CAMERA_REPO],
})
export class CameraModule {}
