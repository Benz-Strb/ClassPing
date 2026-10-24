import { Module } from '@nestjs/common';
import { CameraModule } from '../camera/camera.module.js';
import { CLOCK } from '../common/clock.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [CameraModule],
  controllers: [MediaController],
  providers: [MediaService, { provide: CLOCK, useValue: () => new Date() }],
})
export class MediaModule {}
