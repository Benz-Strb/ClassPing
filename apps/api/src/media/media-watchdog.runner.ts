import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CAMERA_REPO, type CameraIdentity, type CameraRepo } from '../camera/camera.repo.js';
import { CameraService } from '../camera/camera.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { MEDIA_CONTROL, type MediaConn, type MediaControl } from './media-control.client.js';
import { CAMERA_PATH } from './media-path.js';
import { ViewerSessions } from './viewer-sessions.js';

const CHECK_EVERY_MS = 30_000;

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
    @Inject(ViewerSessions) private readonly viewers: ViewerSessions,
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
      const mark = this.viewers.mark();
      const all = await this.control.list();
      this.viewers.prune(new Set(all.filter((c) => c.kind === 'webrtc').map((c) => c.id)), mark);
      const conns = all.filter((c) => c.state !== 'idle');
      const current = new Map<string, Promise<string | null>>();
      for (const conn of conns) {
        const cameraId = CAMERA_PATH.exec(conn.path)?.[1];
        if (!cameraId) {
          await this.kick(conn, 'path ไม่ใช่ของกล้อง');
          continue;
        }
        if (!current.has(cameraId)) current.set(cameraId, this.currentSession(cameraId));
        const sessionId = await current.get(cameraId);
        if (!sessionId) {
          await this.kick(conn, 'ไม่มีคาบแล้ว');
        } else if (conn.kind === 'webrtc' && this.viewers.sessionOf(conn.id) !== sessionId) {
          // คนดูของคาบเก่า หรือต่อไว้ก่อน API เริ่มใหม่ ต้องต่อใหม่ด้วย token ของคาบนี้
          await this.kick(conn, 'คาบไม่ตรง');
        }
      }
    } catch (error) {
      this.logger.warn(`ตรวจสายกล้องไม่สำเร็จ: ${String(error)}`);
    }
  }

  private async currentSession(cameraId: string): Promise<string | null> {
    const camera: CameraIdentity | null = await this.cameras.findById(cameraId);
    if (!camera) return null;
    return (await this.sessions.liveSessionFor(camera, this.now()))?.id ?? null;
  }

  private async kick(conn: MediaConn, reason: string) {
    await this.control.kick(conn);
    this.logger.log(`ตัดสาย ${conn.kind} ที่ ${conn.path} (${reason})`);
  }
}
