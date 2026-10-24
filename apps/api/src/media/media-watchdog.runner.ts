import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CAMERA_REPO, type CameraIdentity, type CameraRepo } from '../camera/camera.repo.js';
import { CameraService } from '../camera/camera.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { MEDIA_CONTROL, type MediaConn, type MediaControl } from './media-control.client.js';
import { CAMERA_PATH } from './media-path.js';

const CHECK_EVERY_MS = 30_000;

// MediaMTX ถามสิทธิ์แค่ตอนเริ่มต่อ หมดคาบแล้วต้องตัดสายเอง ไม่งั้นกล้องที่ค้างจะอัดต่อ
// start() เรียกจาก main.ts ที่เดียว
@Injectable()
export class MediaWatchdogRunner implements OnModuleDestroy {
  private readonly logger = new Logger(MediaWatchdogRunner.name);
  private timer?: NodeJS.Timeout;
  // คาบที่แต่ละกล้องใช้อยู่รอบก่อน เปลี่ยนคาบแล้วต้องตัดคนดูของคาบเก่า
  private readonly lastSession = new Map<string, string>();

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
      const current = new Map<string, Promise<string | null>>();
      const changed = new Set<string>();
      for (const conn of conns) {
        const cameraId = CAMERA_PATH.exec(conn.path)?.[1];
        if (!cameraId) {
          await this.kick(conn, 'path ไม่ใช่ของกล้อง');
          continue;
        }
        if (!current.has(cameraId)) {
          const pending = this.currentSession(cameraId);
          current.set(cameraId, pending);
          const sessionId = await pending;
          const before = this.lastSession.get(cameraId);
          if (sessionId && before && before !== sessionId) changed.add(cameraId);
          if (sessionId) this.lastSession.set(cameraId, sessionId);
          else this.lastSession.delete(cameraId);
        }
        const sessionId = await current.get(cameraId);
        if (!sessionId) {
          await this.kick(conn, 'ไม่มีคาบแล้ว');
        } else if (changed.has(cameraId) && conn.kind === 'webrtc') {
          // กล้องส่งต่อได้ คนดูของคาบเก่าต้องออก (คนของคาบใหม่ต่อใหม่เองด้วย token ใหม่)
          await this.kick(conn, 'เปลี่ยนคาบ');
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
