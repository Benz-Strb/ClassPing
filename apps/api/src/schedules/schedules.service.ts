import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { parseBody } from '../common/validate.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { CoursesService } from '../courses/courses.service.js';
import { RoomsRepo } from '../rooms/rooms.repo.js';
import {
  addDays,
  bangkokDate,
  bangkokTime,
  cameraOpened,
  daysBetween,
  isDate,
  overlaps,
  planDay,
  weekdayOf,
  type OverrideLike,
  type PlannedSession,
  type ScheduleLike,
} from '../sessions/plan-day.js';
import type { AppUser } from '../users/users.service.js';
import {
  SCHEDULES_REPO,
  type ExamSlot,
  type Override,
  type Schedule,
  type SchedulesRepo,
} from './schedules.repo.js';

export interface SessionSyncer {
  syncCourse(courseId: string): Promise<void>;
}

export const SESSION_SYNCER = Symbol('SESSION_SYNCER');

const DAY_START = '07:00';
const DAY_END = '22:00';
const MIN_LENGTH_MIN = 15;
const MAX_LENGTH_MIN = 6 * 60;
const MAX_RANGE_DAYS = 31;
export const MAX_AHEAD_DAYS = 365;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const time = z
  .string({ error: 'กรุณาใส่เวลา' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'ใส่เวลาแบบ 09:00' });
const weekday = z
  .number({ error: 'กรุณาเลือกวัน' })
  .int({ error: 'วันไม่ถูกต้อง' })
  .min(0, { error: 'วันไม่ถูกต้อง' })
  .max(6, { error: 'วันไม่ถูกต้อง' });
export const roomId = z.string({ error: 'กรุณาเลือกห้อง' });

const createSchema = z.object({ weekday, startTime: time, endTime: time, roomId });
const updateSchema = createSchema.partial();
const overrideSchema = z.object({
  cancelled: z.boolean({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }).optional(),
  roomId: roomId.nullish(),
  startTime: time.nullish(),
  endTime: time.nullish(),
});

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
const scheduleNotFound = () => new AppError(404, 'SCHEDULE_NOT_FOUND', 'ไม่พบตารางเรียนนี้');
export const roomConflict = (roomName: string, courseCode: string, start: string, end: string) =>
  new AppError(
    409,
    'ROOM_CONFLICT',
    `${roomName} มีวิชา ${courseCode} เวลา ${start}-${end} แล้ว`,
  );
export const timeConflict = (start: string, end: string) =>
  new AppError(409, 'TIME_CONFLICT', `วิชานี้มีเรียนเวลา ${start}-${end} อยู่แล้ว`);
export const sessionStarted = () =>
  new AppError(400, 'SESSION_STARTED', 'คาบนี้กล้องเริ่มเช็คชื่อแล้ว แก้ไม่ได้');

const NEW_SCHEDULE = 'new';

export function checkTimes(start: string, end: string, label = 'เวลาเรียน') {
  if (start >= end) throw badRequest('เวลาเริ่มต้องก่อนเวลาจบ');
  if (start < DAY_START || end > DAY_END) {
    throw badRequest(`${label}ต้องอยู่ในช่วง ${DAY_START}-${DAY_END}`);
  }
  const length = minutes(end) - minutes(start);
  if (length < MIN_LENGTH_MIN || length > MAX_LENGTH_MIN) {
    throw badRequest('คาบต้องยาว 15 นาที ถึง 6 ชั่วโมง');
  }
}

// คาบเรียนของตารางนี้ทับห้องสอบของวิชาอื่น
// คาบสอบของวิชาเดียวกันไม่นับ เพราะวันนั้นคาบสอบแทนคาบเรียน
function checkExamClash(session: PlannedSession | undefined, exams: ExamSlot[]) {
  if (!session) return;
  const hit = exams.find(
    (e) => e.courseId !== session.courseId && e.roomId === session.roomId && overlaps(e, session),
  );
  if (!hit) return;
  throw roomConflict(
    hit.roomName,
    hit.courseCode,
    bangkokTime(hit.startsAt),
    bangkokTime(hit.endsAt),
  );
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly courses: CoursesService,
    private readonly rooms: RoomsRepo,
    @Inject(SCHEDULES_REPO) private readonly repo: SchedulesRepo,
    @Inject(SESSION_SYNCER) private readonly syncer: SessionSyncer,
    @Inject(CLOCK) private readonly now: Clock,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
  ) {}

  async list(user: AppUser, courseId: string): Promise<Schedule[]> {
    await this.courses.getOwned(user, courseId);
    return this.repo.listByCourse(courseId);
  }

  async create(user: AppUser, courseId: string, body: unknown): Promise<Schedule> {
    await this.courses.getOwned(user, courseId);
    const input = parseBody(createSchema, body);
    checkTimes(input.startTime, input.endTime);
    await this.checkRoom(input.roomId);
    await this.checkWeeklyConflict({ ...input, id: null, courseId });

    const schedule = await this.repo.insert({ ...input, courseId });
    await this.sync(courseId);
    return schedule;
  }

  async update(user: AppUser, scheduleId: string, body: unknown): Promise<Schedule> {
    const current = await this.owned(user, scheduleId);
    const patch = parseBody(updateSchema, body);
    const next = { ...current, ...patch };
    checkTimes(next.startTime, next.endTime);
    if (patch.roomId) await this.checkRoom(patch.roomId);
    await this.checkWeeklyConflict(next);

    const schedule = await this.repo.update(scheduleId, patch);
    await this.sync(current.courseId);
    return schedule;
  }

  async remove(user: AppUser, scheduleId: string): Promise<void> {
    const current = await this.owned(user, scheduleId);
    await this.repo.remove(scheduleId);
    await this.sync(current.courseId);
  }

  async listOverrides(
    user: AppUser,
    courseId: string,
    from: string,
    to: string,
  ): Promise<Override[]> {
    await this.courses.getOwned(user, courseId);
    if (!isDate(from) || !isDate(to) || from > to) {
      throw badRequest('ช่วงวันที่ไม่ถูกต้อง');
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw badRequest(`ดูได้ครั้งละไม่เกิน ${MAX_RANGE_DAYS} วัน`);
    }
    const schedules = await this.repo.listByCourse(courseId);
    return this.repo.listOverrides(
      schedules.map((s) => s.id),
      from,
      to,
    );
  }

  async setOverride(
    user: AppUser,
    scheduleId: string,
    date: string,
    body: unknown,
  ): Promise<Override> {
    const schedule = await this.owned(user, scheduleId);
    this.checkOverrideDate(schedule, date);
    const input = parseBody(overrideSchema, body);

    let override: Override;
    if (input.cancelled) {
      override = {
        scheduleId,
        onDate: date,
        cancelled: true,
        roomId: null,
        startTime: null,
        endTime: null,
      };
    } else {
      override = {
        scheduleId,
        onDate: date,
        cancelled: false,
        roomId: input.roomId ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      };
      if (!override.roomId && !override.startTime && !override.endTime) {
        throw badRequest('ยังไม่ได้เลือกว่าจะเปลี่ยนอะไร');
      }
      checkTimes(
        override.startTime ?? schedule.startTime,
        override.endTime ?? schedule.endTime,
      );
      if (override.roomId) await this.checkRoom(override.roomId);
    }
    await this.checkNotStarted(schedule, date, override);
    if (!override.cancelled) await this.checkDayConflict(schedule, override);

    const saved = await this.repo.saveOverride(override);
    await this.sync(schedule.courseId);
    return saved;
  }

  async clearOverride(user: AppUser, scheduleId: string, date: string): Promise<void> {
    const schedule = await this.owned(user, scheduleId);
    const notFound = () => new AppError(404, 'OVERRIDE_NOT_FOUND', 'วันนี้ไม่ได้เปลี่ยนอะไรไว้');
    if (!isDate(date)) throw notFound();
    await this.checkNotStarted(schedule, date, null);
    if (!(await this.repo.removeOverride(scheduleId, date))) throw notFound();
    await this.sync(schedule.courseId);
  }

  private async owned(user: AppUser, scheduleId: string): Promise<Schedule> {
    if (!UUID.test(scheduleId)) throw scheduleNotFound();
    const schedule = await this.repo.findById(scheduleId);
    if (!schedule) throw scheduleNotFound();
    try {
      await this.courses.getOwned(user, schedule.courseId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'COURSE_NOT_FOUND') throw scheduleNotFound();
      throw error;
    }
    return schedule;
  }

  private async checkRoom(id: string) {
    if (!UUID.test(id) || !(await this.rooms.findById(id))) {
      throw new AppError(400, 'ROOM_NOT_FOUND', 'ไม่พบห้องนี้');
    }
  }

  private checkOverrideDate(schedule: Schedule, date: string) {
    if (!isDate(date)) throw badRequest('วันที่ไม่ถูกต้อง');
    const today = bangkokDate(this.now());
    if (date < today) throw new AppError(400, 'DATE_IN_PAST', 'เปลี่ยนวันที่ผ่านไปแล้วไม่ได้');
    if (date > addDays(today, MAX_AHEAD_DAYS)) {
      throw badRequest('เปลี่ยนล่วงหน้าได้ไม่เกิน 1 ปี');
    }
    if (weekdayOf(date) !== schedule.weekday) {
      throw new AppError(400, 'WRONG_WEEKDAY', 'วันนั้นไม่มีเรียนตามตารางนี้');
    }
  }

  // บันทึกไปแล้ว ถ้าสร้างคาบไม่สำเร็จ รอบทุกชั่วโมงจะสร้างให้เอง
  private async sync(courseId: string) {
    try {
      await this.syncer.syncCourse(courseId);
    } catch (error) {
      this.logger.warn(`สร้างคาบของวิชา ${courseId} ไม่สำเร็จ: ${String(error)}`);
    }
  }

  // คาบวันนี้ที่กล้องเปิดแล้ว (ทั้งเวลาเดิมและเวลาใหม่) แก้ไม่ได้
  private async checkNotStarted(schedule: Schedule, date: string, next: Override | null) {
    const now = this.now();
    if (date !== bangkokDate(now)) return;
    const current = (await this.repo.listOverridesOnDate(date)).filter(
      (o) => o.scheduleId === schedule.id,
    );
    const [before] = planDay(date, [schedule], current);
    const [after] = planDay(date, [schedule], next ? [next] : []);
    const opened = (s?: { startsAt: Date }) => !!s && cameraOpened(s.startsAt, now, this.config?.cameraOpenBeforeMin);
    if (opened(before) || opened(after)) {
      throw sessionStarted();
    }
  }

  private async checkWeeklyConflict(next: {
    id: string | null;
    courseId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    roomId: string;
  }) {
    const others = (await this.repo.listByWeekday(next.weekday)).filter((s) => s.id !== next.id);
    const hit = others.find(
      (s) =>
        (s.roomId === next.roomId || s.courseId === next.courseId) &&
        s.startTime < next.endTime &&
        next.startTime < s.endTime,
    );
    if (hit?.roomId === next.roomId) {
      throw roomConflict(hit.roomName, hit.courseCode, hit.startTime, hit.endTime);
    }
    if (hit) throw timeConflict(hit.startTime, hit.endTime);

    // วันที่มีการเปลี่ยนเฉพาะวันไว้ ต้องเช็กทีละวันด้วย
    const mine: ScheduleLike = { ...next, id: next.id ?? NEW_SCHEDULE };
    const today = bangkokDate(this.now());
    const overrides = (
      await this.repo.listOverridesBetween(today, addDays(today, MAX_AHEAD_DAYS))
    ).filter((o) => weekdayOf(o.onDate) === next.weekday);
    for (const date of new Set(overrides.map((o) => o.onDate))) {
      await this.checkDate(
        date,
        [...others, mine],
        overrides.filter((o) => o.onDate === date),
        mine.id,
      );
    }

    // คาบสอบในวันเดียวกันของสัปดาห์ เทียบกับคาบของตารางนี้ในวันนั้น (หลัง override)
    const exams = (await this.repo.listExamsBetween(today, addDays(today, MAX_AHEAD_DAYS))).filter(
      (e) => weekdayOf(e.onDate) === next.weekday,
    );
    for (const exam of exams) {
      const [session] = planDay(
        exam.onDate,
        [mine],
        overrides.filter((o) => o.onDate === exam.onDate && o.scheduleId === mine.id),
      );
      checkExamClash(session, [exam]);
    }
  }

  private async checkDayConflict(schedule: Schedule, override: Override) {
    const date = override.onDate;
    const schedules = await this.repo.listByWeekday(schedule.weekday);
    const overrides = (await this.repo.listOverridesOnDate(date)).filter(
      (o) => o.scheduleId !== schedule.id,
    );
    await this.checkDate(date, schedules, [...overrides, override], schedule.id);
    const [session] = planDay(date, [schedule], [override]);
    checkExamClash(session, await this.repo.listExamsBetween(date, date));
  }

  // วางคาบของวันนั้นทุกวิชา แล้วดูว่าคาบของตารางนี้ไปทับห้องหรือทับวิชาเดียวกันไหม
  private async checkDate(
    date: string,
    schedules: (ScheduleLike & { courseCode?: string })[],
    overrides: OverrideLike[],
    scheduleId: string,
  ) {
    const sessions = planDay(date, schedules, overrides);
    const mine = sessions.find((s) => s.scheduleId === scheduleId);
    if (!mine) return;

    const hit = sessions.find(
      (s) =>
        s.scheduleId !== scheduleId &&
        (s.roomId === mine.roomId || s.courseId === mine.courseId) &&
        overlaps(s, mine),
    );
    if (!hit) return;
    const start = bangkokTime(hit.startsAt);
    const end = bangkokTime(hit.endsAt);
    if (hit.roomId !== mine.roomId) throw timeConflict(start, end);

    const other = schedules.find((s) => s.id === hit.scheduleId);
    const roomName = (await this.rooms.findById(mine.roomId))?.name ?? 'ห้องนี้';
    throw roomConflict(roomName, other?.courseCode ?? '', start, end);
  }
}
