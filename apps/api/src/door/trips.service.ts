import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  ATTENDANCE_ADMIN_REPO,
  type AttendanceAdminRepo,
  type SessionInfo,
} from '../attendance/attendance-admin.repo.js';
import { ATTENDANCE_REPO, type AttendanceRepo } from '../attendance/attendance.repo.js';
import { AttendanceService, type SessionAttendance } from '../attendance/attendance.service.js';
import { rulesFor } from '../attendance/decide.js';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { parseBody } from '../common/validate.js';
import { CoursesService } from '../courses/courses.service.js';
import { RosterService } from '../courses/roster.service.js';
import type { AppUser } from '../users/users.service.js';
import { DOOR_REPO, type DoorRepo, type StoredTrip } from './door.repo.js';
import { OpenTrips } from './open-trips.js';
import { inSession, outOfRoom, type OutLabel } from './out-of-room.js';

export interface OutOfRoomReportRow {
  sessionId: string;
  onDate: string;
  kind: 'class' | 'exam';
  studentCode: string;
  totalSeconds: number;
  label: OutLabel | null;
  trips: { outAt: string; backAt: string | null }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const backAtSchema = z.object({
  backAt: z.iso.datetime({ offset: true, error: 'เวลากลับไม่ถูกต้อง' }),
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
      // อาจารย์กรอกเวลากลับพร้อมระบุตัว (รอบที่กล้องไม่เห็นตอนกลับ)
      backAt: z.iso.datetime({ offset: true, error: 'เวลากลับไม่ถูกต้อง' }).optional(),
    }),
  ],
  { error: 'คำสั่งไม่ถูกต้อง' },
);

const rangeSchema = z
  .object({
    from: z.iso.date({ error: 'วันที่เริ่มต้นต้องเป็นรูปแบบ YYYY-MM-DD' }),
    to: z.iso.date({ error: 'วันที่สิ้นสุดต้องเป็นรูปแบบ YYYY-MM-DD' }),
  })
  .refine((r) => r.from <= r.to, { error: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด' })
  .refine((r) => r.to <= oneYearAfter(r.from), { error: 'เลือกช่วงวันที่ได้ไม่เกิน 1 ปี' });

function oneYearAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // วันที่ผิดรูปแบบมี error ของช่องนั้นอยู่แล้ว
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

interface Span {
  outAt: Date;
  backAt: Date | null;
}

// ยังไม่กลับ = ไม่มีปลายช่วง ส่วนการกลับตรงกับเวลาที่อีกรอบออกไม่ถือว่าทับ
function overlaps(a: Span, b: Span): boolean {
  const aEnd = a.backAt?.getTime() ?? Infinity;
  const bEnd = b.backAt?.getTime() ?? Infinity;
  return a.outAt.getTime() < bEnd && b.outAt.getTime() < aEnd;
}

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly attendance: AttendanceService,
    private readonly courses: CoursesService,
    private readonly roster: RosterService,
    @Inject(ATTENDANCE_ADMIN_REPO) private readonly admin: AttendanceAdminRepo,
    @Inject(ATTENDANCE_REPO) private readonly captures: AttendanceRepo,
    @Inject(DOOR_REPO) private readonly door: DoorRepo,
    private readonly openTrips: OpenTrips,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async setBack(
    user: AppUser,
    sessionId: string,
    tripId: string,
    body: unknown,
  ): Promise<SessionAttendance> {
    const { backAt: raw } = parseBody(backAtSchema, body);
    const session = await this.attendance.owned(user, sessionId);
    const { trip, others } = await this.find(sessionId, tripId);
    if (trip.status !== 'confirmed') {
      throw new AppError(409, 'TRIP_NOT_CONFIRMED', 'แก้เวลากลับได้เฉพาะรอบที่ระบุตัวแล้ว');
    }
    const backAt = new Date(raw);
    this.checkBackAt(backAt, trip, session);
    this.checkOverlap({ outAt: trip.outAt, backAt }, others, trip.userId);

    if (!(await this.door.setBack(sessionId, tripId, backAt, user.id))) {
      throw new AppError(409, 'TRIP_NOT_CONFIRMED', 'แก้เวลากลับได้เฉพาะรอบที่ระบุตัวแล้ว');
    }
    if (trip.backAt === null && trip.userId) await this.openTrips.remove(sessionId, trip.userId);
    return this.attendance.view(user, sessionId);
  }

  async remove(user: AppUser, sessionId: string, tripId: string): Promise<SessionAttendance> {
    await this.attendance.owned(user, sessionId);
    const { trip } = await this.find(sessionId, tripId);
    await this.drop(sessionId, trip);
    return this.attendance.view(user, sessionId);
  }

  async review(
    user: AppUser,
    sessionId: string,
    tripId: string,
    body: unknown,
  ): Promise<SessionAttendance> {
    const input = parseBody(reviewSchema, body);
    const session = await this.attendance.owned(user, sessionId);
    const { trip, others } = await this.find(sessionId, tripId);
    if (trip.status === 'confirmed' || (input.action === 'confirm' && !trip.userId)) {
      throw new AppError(409, 'TRIP_NOT_REVIEWABLE', 'รอบนี้ไม่ได้รอตรวจแล้ว');
    }

    if (input.action === 'reject') {
      await this.drop(sessionId, trip);
    } else if (input.action === 'confirm') {
      const roster = await this.roster.entries(session.courseId);
      if (!roster.some((e) => e.userId === trip.userId)) {
        throw new AppError(
          400,
          'STUDENT_NOT_IN_COURSE',
          'นักศึกษาคนนี้ออกจากรายชื่อวิชาแล้ว ยืนยันไม่ได้ เลือกคนอื่นหรือปฏิเสธรอบนี้',
        );
      }
      if (!(await this.door.identify(sessionId, tripId, trip.userId!, 'keep'))) {
        throw new AppError(409, 'TRIP_NOT_REVIEWABLE', 'รอบนี้ไม่ได้รอตรวจแล้ว');
      }
    } else {
      await this.reassign(user, session, trip, others, input);
    }
    return this.attendance.view(user, sessionId);
  }

  async report(user: AppUser, courseId: string, query: unknown): Promise<OutOfRoomReportRow[]> {
    const { from, to } = parseBody(rangeSchema, query);
    await this.courses.getOwned(user, courseId);
    const [rows, courseRules] = await Promise.all([
      this.door.courseTrips(courseId, from, to),
      this.admin.rules(courseId),
    ]);

    // คนที่ออกจากรายชื่อแล้วไม่อยู่ในรายงาน เหมือนรายงานเช็คชื่อที่ไล่ตามรายชื่อปัจจุบัน
    const onRoster = new Set((await this.roster.entries(courseId)).map((e) => e.studentCode));
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!onRoster.has(row.studentCode)) continue;
      const key = `${row.sessionId}|${row.studentCode}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()]
      .filter((group) => inSession(group, group[0].startsAt).length > 0)
      .map((group): OutOfRoomReportRow => {
        const first = group[0];
        const trips = inSession(group, first.startsAt).sort(
          (a, b) => a.outAt.getTime() - b.outAt.getTime(),
        );
        const limit = rulesFor(first, courseRules).outOfRoomLimitMin;
        const result = outOfRoom(trips, first.startsAt, first.endsAt, limit);
        return {
          sessionId: first.sessionId,
          onDate: first.onDate,
          kind: first.kind,
          studentCode: first.studentCode,
          totalSeconds: result.totalSeconds,
          label: result.label,
          trips: trips.map((t) => ({
            outAt: t.outAt.toISOString(),
            backAt: t.backAt?.toISOString() ?? null,
          })),
        };
      })
      .sort(
        (a, b) =>
          a.onDate.localeCompare(b.onDate) ||
          a.sessionId.localeCompare(b.sessionId) ||
          a.studentCode.localeCompare(b.studentCode),
      );
  }

  private async reassign(
    user: AppUser,
    session: SessionInfo,
    trip: StoredTrip,
    others: StoredTrip[],
    input: { toCode: string; backAt?: string },
  ): Promise<void> {
    const toUserId = await this.account(session.courseId, input.toCode);
    const backAt = input.backAt ? new Date(input.backAt) : null;
    if (backAt) this.checkBackAt(backAt, trip, session);
    // เวลากลับที่กล้องหน้าห้องจับได้เป็นของคนที่จำผิด จึงล้างทิ้ง (คนเดิมที่เดาไว้ไม่ต้อง)
    const clear = !backAt && trip.backBy === 'front' && toUserId !== trip.userId;
    const span = { outAt: trip.outAt, backAt: backAt ?? (clear ? null : trip.backAt) };
    const target = others.filter((o) => o.userId === toUserId);
    if (span.backAt === null && target.some((o) => o.backAt === null)) {
      throw this.tripOpen();
    }
    this.checkOverlap(span, target, toUserId);

    const back = backAt ? { at: backAt, by: user.id } : clear ? 'clear' : 'keep';
    if (!(await this.door.identify(session.id, trip.id, toUserId, back))) {
      throw new AppError(409, 'TRIP_NOT_REVIEWABLE', 'รอบนี้ไม่ได้รอตรวจแล้ว');
    }
    if (trip.backAt === null && trip.userId) await this.openTrips.remove(session.id, trip.userId);
    if (span.backAt === null) await this.openTrips.add(session.id, toUserId);
  }

  private async drop(sessionId: string, trip: StoredTrip): Promise<void> {
    if (!(await this.door.deleteTrip(sessionId, trip.id))) {
      throw new AppError(404, 'TRIP_NOT_FOUND', 'ไม่พบรอบนี้');
    }
    if (trip.backAt === null && trip.userId) await this.openTrips.remove(sessionId, trip.userId);
    if (!trip.imagePath) return;
    // แถวหายแล้ว ไฟล์ที่ลบไม่ได้ปล่อยไว้ให้คนดูแลระบบเก็บทีหลัง
    await this.captures.removeCaptures([trip.imagePath]).catch((error: unknown) => {
      this.logger.warn(`ลบรูปรอบนอกห้องไม่สำเร็จ: ${String(error)}`);
    });
  }

  private async find(sessionId: string, tripId: string) {
    const trips = await this.door.listTrips(sessionId);
    const trip = UUID.test(tripId) ? trips.find((t) => t.id === tripId) : undefined;
    if (!trip) throw new AppError(404, 'TRIP_NOT_FOUND', 'ไม่พบรอบนี้');
    return { trip, others: trips.filter((t) => t.id !== tripId) };
  }

  private checkOverlap(span: Span, others: StoredTrip[], userId: string | null): void {
    if (others.some((o) => o.userId === userId && overlaps(span, o))) {
      throw new AppError(409, 'TRIP_OVERLAP', 'ช่วงเวลานี้ทับกับรอบอื่นของนักศึกษาคนเดียวกัน');
    }
  }

  // เวลากลับต้องหลังเวลาออก ไม่เกินหมดคาบ และยังไม่ถึง (เท่ากับตอนนี้ได้)
  private checkBackAt(backAt: Date, trip: StoredTrip, session: SessionInfo): void {
    if (backAt <= trip.outAt || backAt > session.endsAt) {
      throw new AppError(400, 'BAD_BACK_TIME', 'เวลากลับต้องอยู่หลังเวลาออกและไม่เกินหมดคาบ');
    }
    if (backAt > this.now()) {
      throw new AppError(400, 'BAD_BACK_TIME', 'เวลากลับต้องไม่อยู่ในอนาคต');
    }
  }

  private tripOpen() {
    return new AppError(409, 'TRIP_OPEN', 'นักศึกษาคนนี้มีรอบที่ยังไม่กลับอยู่แล้ว');
  }

  private async account(courseId: string, code: string): Promise<string> {
    const entry = (await this.roster.entries(courseId)).find((e) => e.studentCode === code);
    if (!entry) throw new AppError(400, 'STUDENT_NOT_IN_COURSE', 'ไม่มีรหัสนี้ในรายชื่อวิชา');
    if (!entry.userId) {
      throw new AppError(409, 'NO_ACCOUNT', 'นักศึกษาคนนี้ยังไม่เคยเข้าสู่ระบบ');
    }
    return entry.userId;
  }
}
