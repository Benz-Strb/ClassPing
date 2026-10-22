import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { CAMERA_REPO, type CameraIdentity, type CameraRepo } from './camera.repo.js';
import { hashToken } from './camera-token.js';

interface CameraRequest {
  headers: Record<string, string | string[] | undefined>;
  camera?: CameraIdentity;
}

const TOUCH_EVERY_MS = 60_000;

// กล้องไม่ได้ login แบบคน ใช้ token ของเครื่องที่ได้จากสคริปต์ seed แทน
@Injectable()
export class CameraGuard implements CanActivate {
  private readonly logger = new Logger(CameraGuard.name);
  private readonly lastTouch = new Map<string, number>();

  constructor(
    @Inject(CAMERA_REPO) private readonly repo: CameraRepo,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CameraRequest>();
    const token = req.headers['x-camera-token'];
    const camera =
      typeof token === 'string' && token ? await this.repo.findByTokenHash(hashToken(token)) : null;
    if (!camera) throw new AppError(401, 'BAD_CAMERA_TOKEN', 'token กล้องไม่ถูกต้อง');

    req.camera = camera;
    await this.touch(camera.id);
    return true;
  }

  // เก็บไว้ดูว่ากล้องยังติดต่อมาอยู่ไหม ไม่ต้องเขียนทุกภาพ
  private async touch(cameraId: string) {
    const now = this.now();
    const last = this.lastTouch.get(cameraId);
    if (last !== undefined && now.getTime() - last < TOUCH_EVERY_MS) return;
    this.lastTouch.set(cameraId, now.getTime());
    await this.repo.touch(cameraId, now).catch((error: unknown) => {
      this.logger.warn(`บันทึกเวลากล้องไม่สำเร็จ: ${String(error)}`);
    });
  }
}
