import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { parseBody } from '../common/validate.js';
import { CoursesService } from '../courses/courses.service.js';
import { RosterService } from '../courses/roster.service.js';
import { DoorEntries } from '../door/door-entries.js';
import { DOOR_REPO, type DoorRepo, type StoredTrip } from '../door/door.repo.js';
import { outOfRoom, tripSeconds, type OutLabel } from '../door/out-of-room.js';
import type { SessionView } from '../sessions/sessions.service.js';
import type { AppUser } from '../users/users.service.js';
import {
  ATTENDANCE_ADMIN_REPO,
  type AttendanceAdminRepo,
  type SessionInfo,
  type StoredAttendance,
} from './attendance-admin.repo.js';
import { rulesFor, statusAt, type AttendanceStatus } from './decide.js';
import { RejectedGuesses } from './rejected-guesses.js';

export interface AttendanceView {
  studentCode: string;
  fullName: string | null;
  faceEnrolled: boolean;
  // null = กล้องยังไม่เห็น
  status: AttendanceStatus | null;
  firstSeenAt: string | null;
  confidence: number | null;
  imageUrl: string | null;
  // ชื่อคนแก้ล่าสุด null = กล้องบันทึก
  updatedBy: string | null;
  // เหตุที่ต้องรอตรวจ null = ความเหมือนไม่พอ
  reviewReason: 'spoof' | null;
  outOfRoom: {
    totalSeconds: number;
    minutes: number;
    label: OutLabel | null;
    trips: TripView[];
  };
}

export interface TripView {
  id: string;
  outAt: string;
  backAt: string | null;
  backBy: 'front' | 'teacher' | null;
  seconds: number;
  imageUrl: string | null;
  // เวลาที่กล้องประตูเห็นเข้าห้องครั้งแรกหลังออก เสนอเป็นเวลากลับ เฉพาะรอบที่ยังไม่กลับ
  suggestedBackAt: string | null;
}

export interface SessionAttendance {
  session: SessionView & { outOfRoomLimitMin: number };
  rows: AttendanceView[];
  unknown: { imageUrl: string; seenAt: string }[];
  // รอบนอกห้องที่กล้องไม่แน่ใจว่าใคร รออาจารย์ตรวจ
  tripReviews: {
    id: string;
    guessCode: string;
    guessName: string | null;
    score: number | null;
    outAt: string;
    imageUrl: string | null;
  }[];
  unknownTrips: { id: string; outAt: string; imageUrl: string | null }[];
}

const SIGNED_URL_SECONDS = 600;
const UNKNOWN_LIMIT = 20;

const statusSchema = z.object({
  status: z.enum(['present', 'late', 'absent'], { error: 'สถานะไม่ถูกต้อง' }),
});

const reviewSchema = z.discriminatedUnion(
  'action',
  [
    z.object({ action: z.literal('confirm') }),
    z.object({ action: z.literal('reject') }),
    z.object({
      action: z.literal('reassign'),
      toCode: z
        .string({ error: 'กรุณาเลือกนักศึกษา' })
        .trim()
        .min(1, { error: 'กรุณาเลือกนักศึกษา' }),
    }),
  ],
  { error: 'คำสั่งไม่ถูกต้อง' },
);

type RosterAccount = Awaited<ReturnType<RosterService['entries']>>[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sessionNotFound = () => new AppError(404, 'SESSION_NOT_FOUND', 'ไม่พบคาบนี้');

@Injectable()
export class AttendanceService {
  constructor(
    private readonly courses: CoursesService,
    private readonly roster: RosterService,
    @Inject(ATTENDANCE_ADMIN_REPO) private readonly repo: AttendanceAdminRepo,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly rejected: RejectedGuesses,
    @Inject(DOOR_REPO) private readonly door: DoorRepo,
    private readonly doorEntries: DoorEntries,
  ) {}

  async view(user: AppUser, sessionId: string): Promise<SessionAttendance> {
    const session = await this.owned(user, sessionId);
    const [entries, rows, unknown, trips, courseRules] = await Promise.all([
      this.roster.entries(session.courseId),
      this.repo.listBySession(sessionId),
      this.repo.recentUnknown(sessionId, UNKNOWN_LIMIT),
      this.door.listTrips(sessionId),
      this.repo.rules(session.courseId),
    ]);
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    const limitMin = rulesFor(session, courseRules).outOfRoomLimitMin;

    const tripsByUser = new Map<string, StoredTrip[]>();
    for (const t of trips) {
      if (t.status !== 'confirmed' || !t.userId) continue;
      tripsByUser.set(t.userId, [...(tripsByUser.get(t.userId) ?? []), t]);
    }
    const reviews = trips
      .filter((t) => t.status === 'pending')
      .sort((a, b) => b.outAt.getTime() - a.outAt.getTime());
    const unknownTrips = trips
      .filter((t) => t.status === 'unknown')
      .sort((a, b) => b.outAt.getTime() - a.outAt.getTime())
      .slice(0, UNKNOWN_LIMIT);

    const urls = await this.repo.signCaptures(
      [
        ...rows.flatMap((r) => (r.imagePath ? [r.imagePath] : [])),
        ...unknown.map((u) => u.imagePath),
        ...[...tripsByUser.values(), reviews, unknownTrips].flatMap((list) =>
          list.flatMap((t) => (t.imagePath ? [t.imagePath] : [])),
        ),
      ],
      SIGNED_URL_SECONDS,
    );

    const views = entries.map((entry): AttendanceView => {
      const row = entry.userId ? byUser.get(entry.userId) : undefined;
      return {
        studentCode: entry.studentCode,
        fullName: entry.fullName,
        faceEnrolled: entry.faceEnrolled,
        status: row?.status ?? null,
        firstSeenAt: row?.firstSeenAt?.toISOString() ?? null,
        confidence: row?.confidence ?? null,
        imageUrl: row?.imagePath ? (urls.get(row.imagePath) ?? null) : null,
        updatedBy: row?.updatedBy ? row.updatedByName : null,
        reviewReason: row?.reviewReason ?? null,
        outOfRoom: this.outOfRoomView(
          session,
          limitMin,
          (entry.userId && tripsByUser.get(entry.userId)) || [],
          urls,
        ),
      };
    });
    // รอตรวจขึ้นก่อน ที่เหลือเรียงตามรหัส
    views.sort(
      (a, b) =>
        Number(b.status === 'pending') - Number(a.status === 'pending') ||
        a.studentCode.localeCompare(b.studentCode),
    );

    return {
      session: { ...this.sessionView(session), outOfRoomLimitMin: limitMin },
      rows: views,
      unknown: unknown.flatMap((u) => {
        const imageUrl = urls.get(u.imagePath);
        return imageUrl ? [{ imageUrl, seenAt: u.seenAt.toISOString() }] : [];
      }),
      tripReviews: reviews.flatMap((t) => {
        const guess = entries.find((e) => e.userId === t.userId);
        if (!guess) return [];
        return [
          {
            id: t.id,
            guessCode: guess.studentCode,
            guessName: guess.fullName,
            score: t.confidence,
            outAt: t.outAt.toISOString(),
            imageUrl: (t.imagePath && urls.get(t.imagePath)) || null,
          },
        ];
      }),
      unknownTrips: unknownTrips.map((t) => ({
        id: t.id,
        outAt: t.outAt.toISOString(),
        imageUrl: (t.imagePath && urls.get(t.imagePath)) || null,
      })),
    };
  }

  private outOfRoomView(
    session: SessionInfo,
    limitMin: number,
    trips: StoredTrip[],
    urls: Map<string, string>,
  ): AttendanceView['outOfRoom'] {
    const sorted = [...trips].sort((a, b) => a.outAt.getTime() - b.outAt.getTime());
    return {
      ...outOfRoom(sorted, session.endsAt, limitMin),
      trips: sorted.map((t) => ({
        id: t.id,
        outAt: t.outAt.toISOString(),
        backAt: t.backAt?.toISOString() ?? null,
        backBy: t.backBy,
        seconds: tripSeconds(t, session.endsAt),
        imageUrl: (t.imagePath && urls.get(t.imagePath)) || null,
        suggestedBackAt: t.backAt
          ? null
          : (this.doorEntries.between(session.id, t.outAt, session.endsAt)[0]?.toISOString() ??
            null),
      })),
    };
  }

  async setStatus(
    user: AppUser,
    sessionId: string,
    code: string,
    body: unknown,
  ): Promise<SessionAttendance> {
    const { status } = parseBody(statusSchema, body);
    const session = await this.owned(user, sessionId);
    const student = await this.student(session.courseId, code);
    await this.repo.setStatus(sessionId, student, status, user.id);
    return this.view(user, sessionId);
  }

  async review(
    user: AppUser,
    sessionId: string,
    code: string,
    body: unknown,
  ): Promise<SessionAttendance> {
    const input = parseBody(reviewSchema, body);
    const session = await this.owned(user, sessionId);
    const entries = await this.roster.entries(session.courseId);
    const userId = this.account(entries, code);
    const rows = await this.repo.listBySession(sessionId);
    const row = rows.find((r) => r.userId === userId);
    if (row?.status !== 'pending') {
      throw new AppError(409, 'NOT_PENDING', 'รายการนี้ไม่ได้รอตรวจแล้ว');
    }

    if (input.action === 'reject') {
      // รูปยังเก็บไว้ในหน้าที่ไม่รู้จัก แล้วลบเองตามรอบ
      if (row.imagePath) {
        await this.repo.insertUnknown(sessionId, row.imagePath, row.firstSeenAt ?? this.now());
      }
      await this.repo.deleteRow(sessionId, userId);
      // แถว spoof ไม่ล็อกคนนี้ ถ้าตัวจริงเข้ามากล้องจะบันทึกให้ใหม่
      if (row.reviewReason !== 'spoof') this.rejected.reject(sessionId, userId, session.endsAt);
      return this.view(user, sessionId);
    }

    const status = await this.statusFor(session, row);
    if (input.action === 'confirm') {
      await this.repo.setStatus(sessionId, userId, status, user.id);
    } else {
      const toUserId = this.account(entries, input.toCode);
      if (rows.some((r) => r.userId === toUserId)) {
        throw new AppError(409, 'ALREADY_RECORDED', 'นักศึกษาคนนี้มีผลเช็คชื่อในคาบนี้แล้ว');
      }
      await this.repo.moveRow(sessionId, userId, toUserId, status, user.id);
    }
    return this.view(user, sessionId);
  }

  private async statusFor(session: SessionInfo, row: StoredAttendance): Promise<AttendanceStatus> {
    if (!row.firstSeenAt) return 'present';
    const rules = rulesFor(session, await this.repo.rules(session.courseId));
    return statusAt(row.firstSeenAt, session.startsAt, session.endsAt, rules);
  }

  // คาบของวิชาคนอื่นตอบเหมือนหาไม่เจอ
  async owned(user: AppUser, sessionId: string): Promise<SessionInfo> {
    // id ผิดรูปแบบส่งไปถึง Postgres จะได้ error แทนที่จะเป็น 404
    if (!UUID.test(sessionId)) throw sessionNotFound();
    const session = await this.repo.session(sessionId);
    if (!session) throw sessionNotFound();
    try {
      await this.courses.getOwned(user, session.courseId);
    } catch (error) {
      if (error instanceof AppError && error.getStatus() === 404) throw sessionNotFound();
      throw error;
    }
    return session;
  }

  private async student(courseId: string, code: string): Promise<string> {
    return this.account(await this.roster.entries(courseId), code);
  }

  private account(entries: RosterAccount[], code: string): string {
    const entry = entries.find((e) => e.studentCode === code);
    if (!entry) throw new AppError(404, 'STUDENT_NOT_IN_COURSE', 'ไม่มีรหัสนี้ในรายชื่อวิชา');
    if (!entry.userId) {
      throw new AppError(409, 'NO_ACCOUNT', 'นักศึกษาคนนี้ยังไม่เคยเข้าสู่ระบบ');
    }
    return entry.userId;
  }

  private sessionView(session: SessionInfo): SessionView {
    const now = this.now();
    return {
      id: session.id,
      kind: session.kind,
      title: session.title,
      scheduleId: session.scheduleId,
      courseId: session.courseId,
      roomId: session.roomId,
      roomName: session.roomName,
      onDate: session.onDate,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      status: session.endsAt <= now ? 'ended' : session.startsAt <= now ? 'live' : 'upcoming',
    };
  }
}
