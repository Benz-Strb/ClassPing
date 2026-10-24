import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { isDate } from '../sessions/plan-day.js';
import type { AppUser } from '../users/users.service.js';
import { LIVE_REPO, type LiveRepo } from './live.repo.js';
import { cameraPath } from './media-path.js';
import { signMediaToken } from './media-token.js';
import { canDownload, canWatch, type WatchableSession } from './video-access.js';

export interface LiveSessionView {
  id: string;
  kind: 'class' | 'exam';
  title: string | null;
  courseCode: string;
  courseName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  status: 'upcoming' | 'live' | 'ended';
  // กล้องกำลังเปิดอยู่ (รวมช่วงเปิดก่อนเวลา) ดูสดได้
  cameraOpen: boolean;
  hasCamera: boolean;
  canDownload: boolean;
}

export interface LiveTicket {
  whepUrl: string;
  token: string;
  expiresAt: string;
  session: LiveSessionView;
}

const MINUTE = 60_000;
// ใช้แค่ตอนเริ่มต่อ MediaMTX หลุดแล้วหน้าเว็บขอใหม่
const READ_TOKEN_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new AppError(404, 'SESSION_NOT_FOUND', 'ไม่พบคาบนี้');

@Injectable()
export class LiveService {
  constructor(
    @Inject(LIVE_REPO) private readonly repo: LiveRepo,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async listForDate(user: AppUser, date: string): Promise<LiveSessionView[]> {
    if (!isDate(date)) throw new AppError(400, 'BAD_REQUEST', 'วันที่ไม่ถูกต้อง');
    const sessions = await this.repo.sessionsOnDate(date);
    return sessions.filter((s) => canWatch(user, s)).map((s) => this.view(user, s));
  }

  async startLive(user: AppUser, sessionId: string): Promise<LiveTicket> {
    // id ผิดรูปแบบส่งไปถึง Postgres จะได้ error แทนที่จะเป็น 404
    const session = UUID.test(sessionId) ? await this.repo.session(sessionId) : null;
    if (!session || !canWatch(user, session)) throw notFound();
    if (!this.cameraOpen(session)) {
      throw new AppError(409, 'NOT_LIVE', 'ตอนนี้กล้องของคาบนี้ไม่ได้เปิด');
    }
    if (!session.cameraId) throw new AppError(409, 'NO_CAMERA', 'ห้องนี้ยังไม่มีกล้อง');
    const secret = this.config.mediaTokenSecret;
    if (!secret) throw new AppError(503, 'MEDIA_NOT_CONFIGURED', 'ระบบกล้องสดยังไม่พร้อม');

    const path = cameraPath(session.cameraId);
    const exp = this.now().getTime() + READ_TOKEN_MS;
    const token = signMediaToken(secret, { sub: user.id, path, act: 'read', sid: session.id, exp });
    await this.repo.logView(session.id, user.id, 'live');
    return {
      whepUrl: `${this.config.mediaWebrtcUrl}/${path}/whep`,
      token,
      expiresAt: new Date(exp).toISOString(),
      session: this.view(user, session),
    };
  }

  private cameraOpen(session: WatchableSession): boolean {
    const now = this.now().getTime();
    const opensAt = session.startsAt.getTime() - this.config.cameraOpenBeforeMin * MINUTE;
    return opensAt <= now && now < session.endsAt.getTime();
  }

  private view(user: AppUser, session: WatchableSession): LiveSessionView {
    const now = this.now();
    return {
      id: session.id,
      kind: session.kind,
      title: session.title,
      courseCode: session.courseCode,
      courseName: session.courseName,
      roomName: session.roomName,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      status: session.endsAt <= now ? 'ended' : session.startsAt <= now ? 'live' : 'upcoming',
      cameraOpen: session.cameraId !== null && this.cameraOpen(session),
      hasCamera: session.cameraId !== null,
      canDownload: canDownload(user, session),
    };
  }
}
