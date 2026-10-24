import { Inject, Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { parseBody } from '../common/validate.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { CoursesService } from '../courses/courses.service.js';
import { RoomsRepo } from '../rooms/rooms.repo.js';
import { SCHEDULES_REPO, type SchedulesRepo } from '../schedules/schedules.repo.js';
import {
  checkTimes,
  MAX_AHEAD_DAYS,
  roomConflict,
  roomId,
  sessionStarted,
  time,
  timeConflict,
  UUID,
} from '../schedules/schedules.service.js';
import {
  addDays,
  bangkokDate,
  bangkokTime,
  cameraOpened,
  isDate,
  overlaps,
  planDay,
  toInstant,
  weekdayOf,
} from '../sessions/plan-day.js';
import type { AppUser } from '../users/users.service.js';
import {
  EXAMS_REPO,
  type ExamRow,
  type ExamsRepo,
  type NewExam,
  type Person,
} from './exams.repo.js';

export interface ExamView {
  id: string;
  title: string;
  onDate: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  room: { id: string; name: string };
  lateAfterMin: number;
  absentAfterMin: number | null;
  proctors: Person[];
  // กล้องเปิดแล้ว แก้ได้แค่คนคุมสอบ
  locked: boolean;
}

const MAX_MINUTES = 240;
const MAX_PROCTORS = 20;

const minutes = (label: string, min: number) =>
  z
    .number({ error: `${label}ต้องเป็นตัวเลข` })
    .int({ error: `${label}ต้องเป็นจำนวนนาทีเต็ม` })
    .min(min, { error: `${label}ใส่ได้ ${min} ถึง ${MAX_MINUTES} นาที` })
    .max(MAX_MINUTES, { error: `${label}ใส่ได้ ${min} ถึง ${MAX_MINUTES} นาที` });

const examSchema = z
  .object({
    title: z
      .string({ error: 'กรุณาใส่ชื่อการสอบ' })
      .trim()
      .min(1, { error: 'กรุณาใส่ชื่อการสอบ' })
      .max(100, { error: 'ชื่อการสอบยาวไม่เกิน 100 ตัวอักษร' }),
    date: z.string({ error: 'กรุณาเลือกวันสอบ' }).refine(isDate, { error: 'วันที่ไม่ถูกต้อง' }),
    start: time,
    end: time,
    roomId,
    lateAfterMin: minutes('เวลาตัดสาย', 0),
    absentAfterMin: minutes('เวลาตัดขาด', 1).nullable(),
    proctorIds: z
      .array(z.string(), { error: 'ข้อมูลคนคุมสอบไม่ถูกต้อง' })
      .max(MAX_PROCTORS, { error: `คนคุมสอบได้ไม่เกิน ${MAX_PROCTORS} คน` })
      .default([]),
  })
  .refine((e) => e.absentAfterMin === null || e.absentAfterMin > e.lateAfterMin, {
    error: 'เวลาตัดขาดต้องมากกว่าเวลาตัดสาย',
  });

type ExamInput = z.infer<typeof examSchema>;

const examNotFound = () => new AppError(404, 'EXAM_NOT_FOUND', 'ไม่พบคาบสอบนี้');

@Injectable()
export class ExamsService {
  constructor(
    private readonly courses: CoursesService,
    private readonly rooms: RoomsRepo,
    @Inject(SCHEDULES_REPO) private readonly schedules: SchedulesRepo,
    @Inject(EXAMS_REPO) private readonly repo: ExamsRepo,
    @Inject(CLOCK) private readonly now: Clock,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
  ) {}

  async list(user: AppUser, courseId: string): Promise<ExamView[]> {
    await this.courses.getOwned(user, courseId);
    return (await this.repo.listByCourse(courseId)).map((e) => this.view(e));
  }

  async create(user: AppUser, courseId: string, body: unknown): Promise<ExamView> {
    await this.courses.getOwned(user, courseId);
    const input = parseBody(examSchema, body);
    const exam = await this.validate(courseId, input, null);
    const id = await this.repo.insert(exam, input.proctorIds);
    return this.view((await this.repo.findById(id))!);
  }

  async update(user: AppUser, examId: string, body: unknown): Promise<ExamView> {
    const current = await this.owned(user, examId);
    const input = parseBody(examSchema, body);

    if (this.locked(current)) {
      // กล้องเปิดแล้ว ผลเช็คชื่อผูกกับเวลานี้ เปลี่ยนได้แค่คนคุมสอบ
      const next = this.toExam(current.courseId, input);
      const same =
        next.title === current.title &&
        next.roomId === current.roomId &&
        next.startsAt.getTime() === current.startsAt.getTime() &&
        next.endsAt.getTime() === current.endsAt.getTime() &&
        next.lateAfterMin === current.lateAfterMin &&
        next.absentAfterMin === current.absentAfterMin;
      if (!same) throw sessionStarted();
      await this.repo.setProctors(examId, await this.checkProctors(input.proctorIds));
    } else {
      const exam = await this.validate(current.courseId, input, examId);
      await this.repo.update(examId, exam);
      await this.repo.setProctors(examId, input.proctorIds);
    }
    return this.view((await this.repo.findById(examId))!);
  }

  async remove(user: AppUser, examId: string): Promise<void> {
    const current = await this.owned(user, examId);
    if (this.locked(current)) throw sessionStarted();
    await this.repo.remove(examId);
  }

  // ใช้ให้อาจารย์เลือกคนคุมสอบ
  listTeachers(): Promise<Person[]> {
    return this.repo.listTeachers();
  }

  private async owned(user: AppUser, examId: string): Promise<ExamRow> {
    if (!UUID.test(examId)) throw examNotFound();
    const exam = await this.repo.findById(examId);
    if (!exam) throw examNotFound();
    try {
      await this.courses.getOwned(user, exam.courseId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'COURSE_NOT_FOUND') throw examNotFound();
      throw error;
    }
    return exam;
  }

  private async validate(courseId: string, input: ExamInput, selfId: string | null) {
    checkTimes(input.start, input.end, 'เวลาสอบ');
    const today = bangkokDate(this.now());
    if (input.date < today) {
      throw new AppError(400, 'DATE_IN_PAST', 'ตั้งคาบสอบย้อนหลังไม่ได้');
    }
    if (input.date > addDays(today, MAX_AHEAD_DAYS)) {
      throw new AppError(400, 'BAD_REQUEST', 'ตั้งล่วงหน้าได้ไม่เกิน 1 ปี');
    }
    const exam = this.toExam(courseId, input);
    if (cameraOpened(exam.startsAt, this.now(), this.config?.cameraOpenBeforeMin)) {
      throw sessionStarted();
    }
    if (!UUID.test(input.roomId) || !(await this.rooms.findById(input.roomId))) {
      throw new AppError(400, 'ROOM_NOT_FOUND', 'ไม่พบห้องนี้');
    }
    await this.checkProctors(input.proctorIds);
    await this.checkClash(exam, selfId);
    return exam;
  }

  private async checkProctors(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await this.repo.findUsers(unique.filter((id) => UUID.test(id)));
    const teachers = new Set(found.filter((u) => u.role === 'teacher').map((u) => u.id));
    if (unique.some((id) => !teachers.has(id))) {
      throw new AppError(400, 'NOT_A_TEACHER', 'คนคุมสอบต้องเป็นอาจารย์ที่เคยเข้าสู่ระบบแล้ว');
    }
    return unique;
  }

  // ทับห้องกับคาบเรียน/คาบสอบอื่นวันนั้น หรือทับเวลาเรียนของวิชาเดียวกัน
  private async checkClash(exam: NewExam, selfId: string | null) {
    const date = exam.onDate;
    const schedules = await this.schedules.listByWeekday(weekdayOf(date));
    const classes = planDay(date, schedules, await this.schedules.listOverridesOnDate(date));
    const exams = (await this.schedules.listExamsBetween(date, date)).filter(
      (e) => e.id !== selfId,
    );
    const slots = [
      ...classes.map((c) => ({
        ...c,
        courseCode: schedules.find((s) => s.id === c.scheduleId)?.courseCode ?? '',
      })),
      ...exams,
    ];
    const hit = slots.find(
      (s) => (s.roomId === exam.roomId || s.courseId === exam.courseId) && overlaps(s, exam),
    );
    if (!hit) return;
    const start = bangkokTime(hit.startsAt);
    const end = bangkokTime(hit.endsAt);
    if (hit.roomId !== exam.roomId) throw timeConflict(start, end);
    const roomName = (await this.rooms.findById(exam.roomId))?.name ?? 'ห้องนี้';
    throw roomConflict(roomName, hit.courseCode, start, end);
  }

  private toExam(courseId: string, input: ExamInput): NewExam {
    return {
      courseId,
      title: input.title,
      onDate: input.date,
      startsAt: toInstant(input.date, input.start),
      endsAt: toInstant(input.date, input.end),
      roomId: input.roomId,
      lateAfterMin: input.lateAfterMin,
      absentAfterMin: input.absentAfterMin,
    };
  }

  private locked(exam: ExamRow) {
    return cameraOpened(exam.startsAt, this.now(), this.config?.cameraOpenBeforeMin);
  }

  private view(exam: ExamRow): ExamView {
    return {
      id: exam.id,
      title: exam.title,
      onDate: exam.onDate,
      start: bangkokTime(exam.startsAt),
      end: bangkokTime(exam.endsAt),
      startsAt: exam.startsAt.toISOString(),
      endsAt: exam.endsAt.toISOString(),
      room: { id: exam.roomId, name: exam.roomName },
      lateAfterMin: exam.lateAfterMin,
      absentAfterMin: exam.absentAfterMin,
      proctors: exam.proctors,
      locked: this.locked(exam),
    };
  }
}
