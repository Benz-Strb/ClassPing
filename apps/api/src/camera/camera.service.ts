import { Inject, Injectable } from '@nestjs/common';
import { FRAME_QUEUE, type FrameQueue } from '../attendance/frame-queue.js';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { looksLike } from '../common/image-type.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import type { UploadedImage } from '../enrollment/enrollment.service.js';
import { CAMERA_REPO, type CameraIdentity, type CameraRepo } from './camera.repo.js';

export interface CameraSession {
  session: {
    id: string;
    courseCode: string;
    courseName: string;
    startsAt: string;
    endsAt: string;
  } | null;
  fps: number;
}

const FRAMES_PER_SECOND = 1;
// worker ตามไม่ทันเกินนี้ ให้กล้องข้ามภาพไปก่อน ผลจะได้ไม่ช้ากว่าความจริงมาก
export const MAX_WAITING_FRAMES = 20;

const MINUTE = 60_000;

@Injectable()
export class CameraService {
  constructor(
    @Inject(CAMERA_REPO) private readonly repo: CameraRepo,
    @Inject(FRAME_QUEUE) private readonly queue: FrameQueue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async currentSession(camera: CameraIdentity): Promise<CameraSession> {
    const live = await this.live(camera, this.now());
    return {
      session: live && {
        id: live.id,
        courseCode: live.courseCode,
        courseName: live.courseName,
        startsAt: live.startsAt.toISOString(),
        endsAt: live.endsAt.toISOString(),
      },
      fps: FRAMES_PER_SECOND,
    };
  }

  async acceptFrame(
    camera: CameraIdentity,
    file: UploadedImage | undefined,
  ): Promise<{ queued: true }> {
    if (camera.kind !== 'front') {
      throw new AppError(403, 'NOT_FRONT_CAMERA', 'กล้องนี้ไม่ใช่กล้องหน้าห้อง');
    }
    if (!file) throw new AppError(400, 'IMAGE_REQUIRED', 'ยังไม่ได้แนบรูป');
    if (!looksLike('image/jpeg', file.buffer)) {
      throw new AppError(400, 'UNSUPPORTED_IMAGE', 'ส่งได้เฉพาะรูป JPG');
    }

    const receivedAt = this.now();
    const live = await this.live(camera, receivedAt);
    if (!live) throw new AppError(409, 'NO_LIVE_SESSION', 'ตอนนี้ห้องนี้ไม่มีคาบ');
    if ((await this.queue.waiting()) > MAX_WAITING_FRAMES) {
      throw new AppError(429, 'BUSY', 'ภาพรอตรวจเยอะเกินไป ข้ามภาพนี้ไปก่อน');
    }

    await this.queue.add({
      sessionId: live.id,
      cameraId: camera.id,
      receivedAt: receivedAt.toISOString(),
      image: file.buffer.toString('base64'),
    });
    return { queued: true };
  }

  private live(camera: CameraIdentity, now: Date) {
    const opensBy = new Date(now.getTime() + this.config.cameraOpenBeforeMin * MINUTE);
    return this.repo.liveSession(camera.roomId, opensBy, now);
  }
}
