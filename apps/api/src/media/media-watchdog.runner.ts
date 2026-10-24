import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CAMERA_REPO, type CameraIdentity, type CameraRepo } from '../camera/camera.repo.js';
import { CameraService } from '../camera/camera.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { MEDIA_CONTROL, type MediaConn, type MediaControl } from './media-control.client.js';

const CHECK_EVERY_MS = 30_000;
const CAMERA_PATH = /^cam\/([0-9a-f-]{36})$/;

// MediaMTX ถามสิทธิ์แค่ตอนเริ่มต่อ หมดคาบแล้วต้องตัดสายเอง ไม่งั้นกล้องที่ค้างจะอัดต่อ
// start() เรียกจาก main.ts ที่เดียว
@Injectable()
export class MediaWatchdogRunner implements OnModuleDestroy {
  private readonly logger = new Logger(MediaWatchdogRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(MEDIA_CONTROL) private readonly control: MediaControl,
    @Inject(CAMERA_REPO) private readonly cameras: Pick<CameraRepo, 'findById'>,
    @Inject(CameraService) private readonly sessions: Pick<CameraService, 'liveSessionFor'>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  start() {
    if (!this.config.mediaServerSecret) return;
    this.timer = setInterval(() => void this.run(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run() {
    if (!this.config.mediaServerSecret) return;
    try {
      const conns = (await this.control.list()).filter((c) => c.state !== 'idle');
      const allowed = new Map<string, Promise<boolean>>();
      for (const conn of conns) {
        const cameraId = CAMERA_PATH.exec(conn.path)?.[1];
        if (cameraId && !allowed.has(cameraId)) allowed.set(cameraId, this.hasSession(cameraId));
        if (cameraId && (await allowed.get(cameraId))) continue;
        await this.kick(conn);
      }
    } catch (error) {
      this.logger.warn(`ตรวจสายกล้องไม่สำเร็จ: ${String(error)}`);
    }
  }

  private async hasSession(cameraId: string): Promise<boolean> {
    const camera: CameraIdentity | null = await this.cameras.findById(cameraId);
    return camera !== null && (await this.sessions.liveSessionFor(camera, this.now())) !== null;
  }

  private async kick(conn: MediaConn) {
    await this.control.kick(conn);
    this.logger.log(`ตัดสาย ${conn.kind} ที่ ${conn.path} (ไม่มีคาบแล้ว)`);
  }
}
