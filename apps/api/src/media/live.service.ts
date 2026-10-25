import { Inject, Injectable } from '@nestjs/common';
import { LiveFaces } from '../attendance/live-faces.js';
import { CameraService } from '../camera/camera.service.js';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { RosterService } from '../courses/roster.service.js';
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

export interface LiveFacesView {
  // เวลาของเฟรมที่ตรวจ null = ยังไม่มีผล / กล้องหยุดส่ง
  at: string | null;
  // เรียงซ้ายไปขวา n คือเลขที่แสดงบนกรอบ
  faces: {
    n: number;
    box: [number, number, number, number];
    kind: 'match' | 'review' | 'unknown';
    name: string | null;
    studentCode: string | null;
  }[];
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
// รายชื่อวิชาเปลี่ยนไม่บ่อย หน้ากล้องสดถามทุกวินาที
const ROSTER_CACHE_MS = 60_000;

type People = Map<string, { name: string | null; studentCode: string }>;

@Injectable()
export class LiveService {
  private readonly people = new Map<string, { at: number; value: People }>();

  constructor(
    @Inject(LIVE_REPO) private readonly repo: LiveRepo,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
    @Inject(LiveFaces) private readonly liveFaces: Pick<LiveFaces, 'get'>,
    @Inject(RosterService) private readonly roster: Pick<RosterService, 'entries'>,
    @Inject(CameraService) private readonly cameras: Pick<CameraService, 'liveSessionFor'>,
  ) {}

  async listForDate(user: AppUser, date: string): Promise<LiveSessionView[]> {
    if (!isDate(date)) throw new AppError(400, 'BAD_REQUEST', 'วันที่ไม่ถูกต้อง');
    const sessions = (await this.repo.sessionsOnDate(date)).filter((s) => canWatch(user, s));
    const current = new Map<string, string | null>();
    for (const s of sessions) {
      if (s.cameraId && !current.has(s.roomId)) current.set(s.roomId, await this.currentIn(s));
    }
    return sessions.map((s) => this.view(user, s, current.get(s.roomId) === s.id));
  }

  async startLive(user: AppUser, sessionId: string): Promise<LiveTicket> {
    const session = await this.watchable(user, sessionId);
    if (!this.cameraOpen(session)) {
      throw new AppError(409, 'NOT_LIVE', 'ตอนนี้กล้องของคาบนี้ไม่ได้เปิด');
    }
    if (!session.cameraId) throw new AppError(409, 'NO_CAMERA', 'ห้องนี้ยังไม่มีกล้อง');
    // กล้องเปิดก่อนเวลา คาบก่อนหน้าในห้องเดียวกันอาจยังไม่จบ ห้ามเห็นคาบของคนอื่น
    if ((await this.currentIn(session)) !== session.id) {
      throw new AppError(409, 'NOT_LIVE', 'ห้องนี้ยังมีคาบก่อนหน้าอยู่ ดูได้เมื่อคาบนั้นจบ');
    }
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
      session: this.view(user, session, true),
    };
  }

  // กรอบหน้าล่าสุดจากกล้องเช็คชื่อ ไม่บันทึกการเปิดดูซ้ำ (บันทึกตอนขอดูสดแล้ว)
  async faces(user: AppUser, sessionId: string): Promise<LiveFacesView> {
    const session = await this.watchable(user, sessionId);
    const latest = this.liveFaces.get(session.id, this.now());
    if (!latest) return { at: null, faces: [] };
    const people = await this.peopleOf(session.courseId);
    const faces = [...latest.faces]
      .sort((a, b) => a.box[0] + a.box[2] - (b.box[0] + b.box[2]))
      .map((face, i) => {
        const person = face.userId ? people.get(face.userId) : undefined;
        return {
          n: i + 1,
          box: face.box,
          kind: face.kind,
          name: person?.name ?? null,
          studentCode: person?.studentCode ?? null,
        };
      });
    return { at: latest.at.toISOString(), faces };
  }

  private async watchable(user: AppUser, sessionId: string): Promise<WatchableSession> {
    // id ผิดรูปแบบส่งไปถึง Postgres จะได้ error แทนที่จะเป็น 404
    const session = UUID.test(sessionId) ? await this.repo.session(sessionId) : null;
    if (!session || !canWatch(user, session)) throw notFound();
    return session;
  }

  private async peopleOf(courseId: string): Promise<People> {
    const cached = this.people.get(courseId);
    const now = this.now().getTime();
    if (cached && now - cached.at < ROSTER_CACHE_MS) return cached.value;
    const value: People = new Map();
    for (const entry of await this.roster.entries(courseId)) {
      if (entry.userId)
        value.set(entry.userId, { name: entry.fullName, studentCode: entry.studentCode });
    }
    this.people.set(courseId, { at: now, value });
    return value;
  }

  private async currentIn(session: WatchableSession): Promise<string | null> {
    if (!session.cameraId) return null;
    const camera = { id: session.cameraId, roomId: session.roomId, kind: 'front' as const };
    return (await this.cameras.liveSessionFor(camera, this.now()))?.id ?? null;
  }

  private cameraOpen(session: WatchableSession): boolean {
    const now = this.now().getTime();
    const opensAt = session.startsAt.getTime() - this.config.cameraOpenBeforeMin * MINUTE;
    return opensAt <= now && now < session.endsAt.getTime();
  }

  private view(user: AppUser, session: WatchableSession, roomIsOurs: boolean): LiveSessionView {
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
      cameraOpen: session.cameraId !== null && roomIsOurs && this.cameraOpen(session),
      hasCamera: session.cameraId !== null,
      canDownload: canDownload(user, session),
    };
  }
}
