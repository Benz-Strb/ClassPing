import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { CoursesService } from '../courses/courses.service.js';
import { SCHEDULES_REPO, type SchedulesRepo } from '../schedules/schedules.repo.js';
import type { SessionSyncer } from '../schedules/schedules.service.js';
import type { AppUser } from '../users/users.service.js';
import { addDays, bangkokDate, daysBetween, isDate, planDay, type PlannedSession } from './plan-day.js';
import { SESSIONS_REPO, type SessionRow, type SessionsRepo } from './sessions.repo.js';

export interface SessionView {
  id: string;
  courseId: string;
  roomId: string;
  roomName: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  status: 'upcoming' | 'live' | 'ended';
}

// สร้างคาบล่วงหน้า วันนี้ + 6 วัน
const WINDOW_DAYS = 7;
const MAX_RANGE_DAYS = 31;

const keyOf = (s: { scheduleId: string | null; onDate: string }) => `${s.scheduleId}|${s.onDate}`;

const sameSlot = (a: SessionRow, b: PlannedSession) =>
  a.roomId === b.roomId &&
  a.startsAt.getTime() === b.startsAt.getTime() &&
  a.endsAt.getTime() === b.endsAt.getTime();

@Injectable()
export class SessionsService implements SessionSyncer {
  constructor(
    private readonly courses: CoursesService,
    @Inject(SCHEDULES_REPO) private readonly schedules: SchedulesRepo,
    @Inject(SESSIONS_REPO) private readonly repo: SessionsRepo,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  // ทำให้คาบในช่วง 7 วันตรงกับตาราง + การเปลี่ยนเฉพาะวัน
  // คาบที่เริ่มไปแล้วไม่แตะเลย เพราะอาจมีผลเช็คชื่อผูกอยู่ (ลบแล้ว attendance หายตาม)
  async syncCourse(courseId: string): Promise<void> {
    const now = this.now();
    const from = bangkokDate(now);
    const to = addDays(from, WINDOW_DAYS - 1);

    const schedules = await this.schedules.listByCourse(courseId);
    const overrides = await this.schedules.listOverrides(
      schedules.map((s) => s.id),
      from,
      to,
    );
    const planned = new Map<string, PlannedSession>();
    for (let day = 0; day < WINDOW_DAYS; day++) {
      for (const session of planDay(addDays(from, day), schedules, overrides)) {
        planned.set(keyOf(session), session);
      }
    }

    const existing = await this.repo.listByCourse(courseId, from, to);
    const existingKeys = new Set(existing.map(keyOf));
    const toRemove: string[] = [];
    const toUpdate: { id: string; session: PlannedSession }[] = [];

    for (const row of existing) {
      if (row.startsAt <= now) continue;
      const wanted = row.scheduleId ? planned.get(keyOf(row)) : undefined;
      if (!wanted) toRemove.push(row.id);
      else if (!sameSlot(row, wanted)) toUpdate.push({ id: row.id, session: wanted });
    }
    // คาบที่ยังไม่จบสร้างได้ (เช่นเพิ่มตารางตอนคาบกำลังเรียน กล้องจะได้เริ่มทันที)
    const toInsert = [...planned.values()].filter(
      (s) => !existingKeys.has(keyOf(s)) && s.endsAt > now,
    );

    // ลบก่อน แก้ แล้วค่อยเพิ่ม กันชน unique (course_id, starts_at) ตอนสลับเวลา
    if (toRemove.length) await this.repo.remove(toRemove);
    for (const { id, session } of toUpdate) {
      await this.repo.update(id, {
        roomId: session.roomId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      });
    }
    if (toInsert.length) await this.repo.insert(toInsert);
  }

  async syncAll(): Promise<void> {
    const from = bangkokDate(this.now());
    const withSchedules = (await this.schedules.listAll()).map((s) => s.courseId);
    const withSessions = await this.repo.courseIdsInRange(from, addDays(from, WINDOW_DAYS - 1));
    for (const courseId of new Set([...withSchedules, ...withSessions])) {
      await this.syncCourse(courseId);
    }
  }

  async listForCourse(
    user: AppUser,
    courseId: string,
    from: string,
    to: string,
  ): Promise<SessionView[]> {
    await this.courses.getOwned(user, courseId);
    if (!isDate(from) || !isDate(to) || from > to) {
      throw new AppError(400, 'BAD_REQUEST', 'ช่วงวันที่ไม่ถูกต้อง');
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new AppError(400, 'BAD_REQUEST', `ดูได้ครั้งละไม่เกิน ${MAX_RANGE_DAYS} วัน`);
    }

    const now = this.now();
    return (await this.repo.listByCourse(courseId, from, to)).map((row) => ({
      id: row.id,
      courseId: row.courseId,
      roomId: row.roomId,
      roomName: row.roomName,
      onDate: row.onDate,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.endsAt <= now ? 'ended' : row.startsAt <= now ? 'live' : 'upcoming',
    }));
  }
}
