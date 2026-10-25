import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { parseBody } from '../common/validate.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { bangkokDate, bangkokTime } from '../sessions/plan-day.js';
import type { AppUser } from '../users/users.service.js';
import { LIVE_REPO, type LiveRepo } from './live.repo.js';
import { cameraPath } from './media-path.js';
import { signMediaToken, verifyMediaToken } from './media-token.js';
import { PLAYBACK_CLIENT, type PlaybackClient } from './playback.client.js';
import { canDownload, canWatch, type WatchableSession } from './video-access.js';

export interface RecordingView {
  session: {
    kind: 'class' | 'exam';
    title: string | null;
    courseCode: string;
    courseName: string;
    roomName: string;
    startsAt: string;
    endsAt: string;
  };
  segments: { start: string; duration: number }[];
  // วันที่ไฟล์แรกของคาบจะถูกลบ (เก็บ 30 วัน)
  expiresOn: string | null;
  canDownload: boolean;
}

export interface OpenClip {
  path: string;
  start: Date;
  duration: number;
  download: boolean;
  filename: string;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// ตรงกับ recordDeleteAfter ใน services/media/mediamtx.yml
const KEEP_DAYS = 30;
// เท่ากับ signed URL รูปอื่นในระบบ
const LINK_MS = 10 * MINUTE;
// ช่วงสั้นกว่านี้ (กล้องต่อใหม่แป๊บเดียว) ไม่ต้องแสดง
const MIN_SEGMENT_SECONDS = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const linkSchema = z.object({
  start: z.iso.datetime({ offset: true, error: 'เวลาเริ่มไม่ถูกต้อง' }),
  duration: z.number({ error: 'ความยาวไม่ถูกต้อง' }).positive({ error: 'ความยาวไม่ถูกต้อง' }),
  download: z.boolean({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }).default(false),
});

const notFound = () => new AppError(404, 'SESSION_NOT_FOUND', 'ไม่พบคาบนี้');

@Injectable()
export class RecordingService {
  constructor(
    @Inject(LIVE_REPO) private readonly repo: LiveRepo,
    @Inject(PLAYBACK_CLIENT) private readonly playback: PlaybackClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async list(user: AppUser, sessionId: string): Promise<RecordingView> {
    const session = await this.watchable(user, sessionId);
    const allowed = canDownload(user, session);
    const info = {
      kind: session.kind,
      title: session.title,
      courseCode: session.courseCode,
      courseName: session.courseName,
      roomName: session.roomName,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
    };
    if (!session.cameraId) {
      return { session: info, segments: [], expiresOn: null, canDownload: allowed };
    }

    const { from, to } = await this.range(session);
    const found = await this.playback.list(cameraPath(session.cameraId), from, to);
    const segments = found.flatMap((seg) => {
      const start = Math.max(seg.start.getTime(), from.getTime());
      const end = Math.min(seg.start.getTime() + seg.duration * 1000, to.getTime());
      const duration = (end - start) / 1000;
      return duration >= MIN_SEGMENT_SECONDS
        ? [{ start: new Date(start).toISOString(), duration }]
        : [];
    });
    const first = found[0]?.start;
    return {
      session: info,
      segments,
      expiresOn: first ? new Date(first.getTime() + KEEP_DAYS * DAY).toISOString() : null,
      canDownload: allowed,
    };
  }

  // ลิงก์อายุสั้นให้ <video> หรือการดาวน์โหลดเปิดได้โดยไม่ต้องแนบ header login
  async link(user: AppUser, sessionId: string, body: unknown): Promise<{ url: string }> {
    const session = await this.watchable(user, sessionId);
    const input = parseBody(linkSchema, body);
    if (input.download && !canDownload(user, session)) {
      throw new AppError(
        403,
        'DOWNLOAD_NOT_ALLOWED',
        'ดาวน์โหลดได้เฉพาะอาจารย์ประจำวิชาและผู้ดูแลระบบ',
      );
    }
    const start = new Date(input.start);
    const { from, to } = await this.range(session);
    if (start < from || start.getTime() + input.duration * 1000 > to.getTime() + 1000) {
      throw new AppError(400, 'BAD_REQUEST', 'ช่วงเวลาอยู่นอกคาบนี้');
    }
    if (!session.cameraId) throw new AppError(404, 'NO_RECORDING', 'ไม่มีไฟล์อัดช่วงนี้');
    const secret = this.config.mediaTokenSecret;
    if (!secret) throw new AppError(503, 'MEDIA_NOT_CONFIGURED', 'ระบบกล้องยังไม่พร้อม');

    const token = signMediaToken(secret, {
      sub: user.id,
      path: cameraPath(session.cameraId),
      act: 'clip',
      sid: session.id,
      // ดูย้อนหลังใช้ลิงก์เดิมขอทีละช่วงตอนกรอ ต้องอยู่ได้ทั้งคลิป
      exp: this.now().getTime() + LINK_MS + (input.download ? 0 : input.duration * 1000),
      start: start.toISOString(),
      dur: input.duration,
      dl: input.download,
    });
    await this.repo.logView(session.id, user.id, input.download ? 'download' : 'playback');
    return { url: `/clips/${token}` };
  }

  openClip(token: string): OpenClip {
    const secret = this.config.mediaTokenSecret;
    const payload = secret ? verifyMediaToken(secret, token, this.now()) : null;
    if (!payload || payload.act !== 'clip' || !payload.start || !payload.dur) {
      throw new AppError(401, 'LINK_EXPIRED', 'ลิงก์หมดอายุแล้ว กดเปิดใหม่อีกครั้ง');
    }
    const start = new Date(payload.start);
    const stamp = `${bangkokDate(start).replaceAll('-', '')}-${bangkokTime(start).replace(':', '')}`;
    return {
      path: payload.path,
      start,
      duration: payload.dur,
      download: payload.dl === true,
      filename: `classping-${stamp}.mp4`,
    };
  }

  // ตั้งแต่กล้องเปิด (ก่อนคาบ) ถึงหมดคาบ แต่ถ้าห้องเดียวกันมีคาบก่อนหน้าที่ยังไม่จบตอนกล้องเปิด
  // เริ่มนับหลังคาบนั้นจบ ไม่งั้นจะเห็นภาพของวิชาอื่น
  private async range(session: WatchableSession) {
    const opensAt = new Date(session.startsAt.getTime() - this.config.cameraOpenBeforeMin * MINUTE);
    const previousEnd = await this.repo.previousEndInRoom(
      session.roomId,
      opensAt,
      session.startsAt,
    );
    return {
      from: previousEnd && previousEnd > opensAt ? previousEnd : opensAt,
      to: session.endsAt,
    };
  }

  private async watchable(user: AppUser, sessionId: string): Promise<WatchableSession> {
    // id ผิดรูปแบบส่งไปถึง Postgres จะได้ error แทนที่จะเป็น 404
    const session = UUID.test(sessionId) ? await this.repo.session(sessionId) : null;
    if (!session || !canWatch(user, session)) throw notFound();
    return session;
  }
}
