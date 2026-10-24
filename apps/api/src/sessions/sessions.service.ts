import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { CoursesService } from '../courses/courses.service.js';
import { SCHEDULES_REPO, type SchedulesRepo } from '../schedules/schedules.repo.js';
import type { SessionSyncer } from '../schedules/schedules.service.js';
import type { AppUser } from '../users/users.service.js';
import {
  addDays,
  bangkokDate,
  cameraOpened,
  daysBetween,
  isDate,
  overlaps,
  planDay,
  type PlannedSession,
} from './plan-day.js';
import { SESSIONS_REPO, type SessionRow, type SessionsRepo } from './sessions.repo.js';

export interface SessionView {
  id: string;
  kind: 'class' | 'exam';
  title: string | null;
  scheduleId: string | null;
  courseId: string;
  roomId: string;
  roomName: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  status: 'upcoming' | 'live' | 'ended';
}

const WINDOW_DAYS = 7;
const MAX_RANGE_DAYS = 31;

const keyOf = (s: { scheduleId: string | null; onDate: string }) => `${s.scheduleId}|${s.onDate}`;

const sameSlot = (a: SessionRow, b: PlannedSession) =>
  a.roomId === b.roomId &&
  a.startsAt.getTime() === b.startsAt.getTime() &&
  a.endsAt.getTime() === b.endsAt.getTime();

@Injectable()
export class SessionsService implements SessionSyncer {
  private readonly logger = new Logger(SessionsService.name);
  // sync ของวิชาเดียวกันต้องต่อคิว ไม่งั้นสองรอบอ่านพร้อมกันแล้วเพิ่มคาบซ้ำ
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly courses: CoursesService,
    @Inject(SCHEDULES_REPO) private readonly schedules: SchedulesRepo,
    @Inject(SESSIONS_REPO) private readonly repo: SessionsRepo,
    @Inject(CLOCK) private readonly now: Clock,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
  ) {}

  syncCourse(courseId: string): Promise<void> {
    return this.enqueue(courseId, () => this.syncNow(courseId));
  }

  // คาบสอบแทนคาบเรียนของวิชาเดียวกันที่ทับ เอาคาบเรียนออกก่อนบันทึกคาบสอบ
  // (ไม่งั้นชน unique course_id + starts_at) sync รอบหลังจะไม่สร้างกลับมาเพราะมีคาบสอบทับอยู่
  // save (บันทึกคาบสอบ) อยู่ในคิวเดียวกัน ไม่ให้ sync แทรกระหว่างลบกับบันทึก
  clearClassesFor(
    courseId: string,
    slot: { onDate: string; startsAt: Date; endsAt: Date },
    save: () => Promise<void>,
  ): Promise<void> {
    return this.enqueue(courseId, async () => {
      const rows = await this.repo.listByCourse(courseId, slot.onDate, slot.onDate);
      const hit = rows.filter((r) => r.kind === 'class' && overlaps(r, slot));
      const now = this.now();
      if (hit.some((r) => cameraOpened(r.startsAt, now, this.config?.cameraOpenBeforeMin))) {
        throw new AppError(400, 'SESSION_STARTED', 'คาบเรียนที่ทับเริ่มเช็คชื่อแล้ว แก้ไม่ได้');
      }
      await this.repo.remove(hit.map((r) => r.id));
      await save();
    });
  }

  private enqueue(courseId: string, task: () => Promise<void>): Promise<void> {
    const run = (this.queues.get(courseId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    this.queues.set(courseId, run);
    void run
      .finally(() => {
        if (this.queues.get(courseId) === run) this.queues.delete(courseId);
      })
      .catch(() => undefined);
    return run;
  }

  // คาบที่กล้องเปิดแล้ว (ก่อนเวลาเริ่มตาม CAMERA_OPEN_BEFORE_MIN) ห้ามแตะ ไม่งั้นผลเช็คชื่อหายตาม
  private async syncNow(courseId: string): Promise<void> {
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

    // คาบสอบแทนคาบเรียนของวิชาเดียวกันที่ทับในวันนั้น และ sync ไม่แตะคาบสอบ
    const rows = await this.repo.listByCourse(courseId, from, to);
    const exams = rows.filter((r) => r.kind === 'exam');
    for (const [key, session] of planned) {
      if (exams.some((e) => e.onDate === session.onDate && overlaps(e, session))) {
        planned.delete(key);
      }
    }
    const existing = rows.filter((r) => r.kind === 'class');
    const existingKeys = new Set(existing.map(keyOf));
    const toRemove: string[] = [];
    const toUpdate: { id: string; session: PlannedSession }[] = [];
    // เวลาเริ่มของแถวที่จะเหลืออยู่ ใช้กันชน unique (course_id, starts_at)
    const taken = new Map<string, number>();

    for (const row of existing) {
      const wanted = row.scheduleId ? planned.get(keyOf(row)) : undefined;
      if (cameraOpened(row.startsAt, now, this.config?.cameraOpenBeforeMin) || (wanted && sameSlot(row, wanted))) {
        taken.set(row.id, row.startsAt.getTime());
      } else if (!wanted) {
        toRemove.push(row.id);
      } else {
        toUpdate.push({ id: row.id, session: wanted });
      }
    }
    const isTaken = (time: Date, exceptId?: string) =>
      [...taken].some(([id, t]) => id !== exceptId && t === time.getTime());
    for (const { id, session } of [...toUpdate]) {
      if (isTaken(session.startsAt, id)) {
        toUpdate.splice(toUpdate.findIndex((u) => u.id === id), 1);
        toRemove.push(id);
      } else {
        taken.set(id, session.startsAt.getTime());
      }
    }
    const toInsert = [...planned.values()].filter(
      (s) => !existingKeys.has(keyOf(s)) && s.endsAt > now && !isTaken(s.startsAt),
    );

    // ลบก่อนเพิ่ม กันชน unique (course_id, starts_at)
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
      try {
        await this.syncCourse(courseId);
      } catch (error) {
        this.logger.warn(`สร้างคาบของวิชา ${courseId} ไม่สำเร็จ: ${String(error)}`);
      }
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
      kind: row.kind,
      title: row.title,
      scheduleId: row.scheduleId,
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
