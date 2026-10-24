import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { CameraModule } from '../camera/camera.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { CLOCK } from '../common/clock.js';
import { HttpMediaControl, MEDIA_CONTROL } from './media-control.client.js';
import { MediaWatchdogRunner } from './media-watchdog.runner.js';
import { LiveController } from './live.controller.js';
import { LIVE_REPO, SupabaseLiveRepo } from './live.repo.js';
import { LiveService } from './live.service.js';
import { MediaController } from './media.controller.js';
import { HttpPlaybackClient, PLAYBACK_CLIENT } from './playback.client.js';
import { ClipsController, RecordingController } from './recording.controller.js';
import { RecordingService } from './recording.service.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [CameraModule, AttendanceModule, CoursesModule],
  controllers: [MediaController, LiveController, RecordingController, ClipsController],
  providers: [
    MediaService,
    LiveService,
    RecordingService,
    { provide: PLAYBACK_CLIENT, useClass: HttpPlaybackClient },
    { provide: LIVE_REPO, useClass: SupabaseLiveRepo },
    MediaWatchdogRunner,
    { provide: MEDIA_CONTROL, useClass: HttpMediaControl },
    { provide: CLOCK, useValue: () => new Date() },
  ],
})
export class MediaModule {}
