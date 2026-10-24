import { Module } from '@nestjs/common';
import { CameraModule } from '../camera/camera.module.js';
import { CLOCK } from '../common/clock.js';
import { HttpMediaControl, MEDIA_CONTROL } from './media-control.client.js';
import { MediaWatchdogRunner } from './media-watchdog.runner.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [CameraModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaWatchdogRunner,
    { provide: MEDIA_CONTROL, useClass: HttpMediaControl },
    { provide: CLOCK, useValue: () => new Date() },
  ],
})
export class MediaModule {}
