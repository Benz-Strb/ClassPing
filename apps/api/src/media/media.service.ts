import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CAMERA_REPO, type CameraRepo } from '../camera/camera.repo.js';
import { CameraService } from '../camera/camera.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { CAMERA_PATH, cameraPath } from './media-path.js';
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

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class MediaService {
  constructor(
    @Inject(CAMERA_REPO) private readonly cameras: Pick<CameraRepo, 'findById'>,
    @Inject(CameraService) private readonly sessions: Pick<CameraService, 'liveSessionFor'>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async authorize(req: MediaAuthRequest): Promise<boolean> {
    switch (req.action) {
      case 'publish':
        return this.canPublish(req);
      case 'read':
        return await this.canRead(req);
      // playback = API ดึงคลิป, api = API ตัดสายตอนหมดคาบ
      case 'playback':
      case 'api': {
        const secret = this.config.mediaServerSecret;
        const given = req.token || req.password || '';
        return secret !== null && same(given, secret);
      }
      default:
        return false;
    }
  }

  // กล้องส่งวิดีโอด้วย token ส่งวิดีโอที่ได้จาก GET /camera/session (ไม่ใช่ token กล้องตัวจริง
  // เพราะ URL ไปอยู่ใน argv ของ ffmpeg) ได้เฉพาะ path ของตัวเอง และเฉพาะตอนที่ห้องมีคาบ
  private async canPublish(req: MediaAuthRequest): Promise<boolean> {
    const secret = this.config.mediaTokenSecret;
    if (secret === null || req.protocol !== 'rtsp') return false;
    const token = new URLSearchParams(req.query ?? '').get('token') ?? '';
    const payload = verifyMediaToken(secret, token, this.now());
    if (!payload || payload.act !== 'publish' || payload.path !== req.path) return false;
    const camera = await this.cameras.findById(payload.sub);
    if (!camera || camera.kind !== 'front' || req.path !== cameraPath(camera.id)) return false;
    return (await this.sessions.liveSessionFor(camera, this.now())) !== null;
  }

  // คนดูสดใช้ token ที่ API ออกให้หลังตรวจสิทธิ์แล้ว (ส่งมาเป็น Bearer หรือช่อง password)
  // token ผูกกับคาบ ต้องเป็นคาบที่ห้องนั้นกำลังใช้กล้องอยู่ตอนต่อ
  private async canRead(req: MediaAuthRequest): Promise<boolean> {
    const secret = this.config.mediaTokenSecret;
    if (secret === null || req.protocol !== 'webrtc') return false;
    const payload = verifyMediaToken(secret, req.token || req.password || '', this.now());
    if (!payload || payload.act !== 'read' || payload.path !== req.path) return false;
    const cameraId = CAMERA_PATH.exec(req.path ?? '')?.[1];
    const camera = cameraId ? await this.cameras.findById(cameraId) : null;
    if (!camera) return false;
    return (await this.sessions.liveSessionFor(camera, this.now()))?.id === payload.sid;
  }
}
