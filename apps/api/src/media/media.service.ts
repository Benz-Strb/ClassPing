import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CAMERA_REPO, type CameraRepo } from '../camera/camera.repo.js';
import { CameraService } from '../camera/camera.service.js';
import { hashToken } from '../camera/camera-token.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { verifyMediaToken } from './media-token.js';

// ข้อมูลที่ MediaMTX ส่งมาถามทุกครั้งที่มีคนเชื่อมต่อ (authMethod: http)
export interface MediaAuthRequest {
  user?: string;
  password?: string;
  token?: string;
  ip?: string;
  action?: string;
  path?: string;
  protocol?: string;
  id?: string | null;
  query?: string;
}

export const cameraPath = (cameraId: string) => `cam/${cameraId}`;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class MediaService {
  constructor(
    @Inject(CAMERA_REPO) private readonly cameras: Pick<CameraRepo, 'findByTokenHash'>,
    @Inject(CameraService) private readonly sessions: Pick<CameraService, 'liveSessionFor'>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async authorize(req: MediaAuthRequest): Promise<boolean> {
    switch (req.action) {
      case 'publish':
        return this.canPublish(req);
      case 'read':
        return this.canRead(req);
      case 'playback': {
        const secret = this.config.mediaPlaybackSecret;
        const given = req.token || req.password || '';
        return secret !== null && same(given, secret);
      }
      default:
        return false;
    }
  }

  // กล้องส่งภาพได้เฉพาะ path ของตัวเอง และเฉพาะตอนที่ห้องมีคาบ (ไม่อัดนอกคาบ)
  private async canPublish(req: MediaAuthRequest): Promise<boolean> {
    if (req.protocol !== 'rtsp') return false;
    const token = new URLSearchParams(req.query ?? '').get('token');
    if (!token) return false;
    const camera = await this.cameras.findByTokenHash(hashToken(token));
    if (!camera || camera.kind !== 'front' || req.path !== cameraPath(camera.id)) return false;
    return (await this.sessions.liveSessionFor(camera, this.now())) !== null;
  }

  // คนดูสดใช้ token ที่ API ออกให้หลังตรวจสิทธิ์แล้ว (ส่งมาเป็น Bearer หรือช่อง password)
  private canRead(req: MediaAuthRequest): boolean {
    const secret = this.config.mediaTokenSecret;
    if (secret === null || req.protocol !== 'webrtc') return false;
    const payload = verifyMediaToken(secret, req.token || req.password || '', this.now());
    return payload !== null && payload.act === 'read' && payload.path === req.path;
  }
}
