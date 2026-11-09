import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { looksLike } from '../common/image-type.js';
import { parseBody } from '../common/validate.js';
import { CoursesService } from '../courses/courses.service.js';
import { ROSTER_REPO, type RosterRepo } from '../courses/roster.repo.js';
import { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import { RoomsRepo } from '../rooms/rooms.repo.js';
import {
  SchedulesService,
  checkTimes,
} from '../schedules/schedules.service.js';
import type { AppUser } from '../users/users.service.js';
import {
  extractTimetable,
  importSchema,
  normalizeCode,
  normalizeName,
  normalizeSection,
  type TimetableRow,
} from './timetable-draft.js';
import { TimetablesRepo, type MatchCourse } from './timetables.repo.js';

export interface TimetableFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
}
export interface MatchResult {
  status: 'matched' | 'unmatched' | 'ambiguous';
  message: string;
  course: {
    id: string;
    code: string;
    name: string;
    section: string | null;
    teacherName: string;
  } | null;
}
export function matchTimetableRow(
  row: TimetableRow,
  candidates: MatchCourse[],
): MatchResult {
  if (
    !row.courseCode ||
    !normalizeName(row.teacherName) ||
    row.weekday === null ||
    !/^\d{2}:\d{2}$/.test(row.startTime) ||
    !/^\d{2}:\d{2}$/.test(row.endTime) ||
    row.startTime >= row.endTime
  ) {
    return {
      status: 'unmatched',
      message: 'ข้อมูลรหัสวิชา อาจารย์ วัน หรือเวลาไม่ครบ',
      course: null,
    };
  }
  const matches = candidates.filter(
    (c) =>
      normalizeCode(c.code) === normalizeCode(row.courseCode) &&
      normalizeName(c.teacherName) === normalizeName(row.teacherName) &&
      (!row.section ||
        normalizeSection(c.section ?? '') === normalizeSection(row.section)) &&
      c.schedules.some(
        (s) =>
          s.weekday === row.weekday &&
          s.startTime === row.startTime &&
          s.endTime === row.endTime &&
          (!row.roomName ||
            normalizeCode(s.roomName) === normalizeCode(row.roomName)),
      ),
  );
  if (matches.length !== 1)
    return {
      status: matches.length ? 'ambiguous' : 'unmatched',
      message: matches.length
        ? 'ตรงกับหลายกลุ่ม กรุณาระบุกลุ่มเรียนหรือห้องให้ชัดเจน'
        : 'ยังไม่พบวิชาที่อาจารย์ กลุ่ม วันและเวลาตรงกัน',
      course: null,
    };
  const { schedules: _schedules, ...course } = matches[0];
  return {
    status: 'matched',
    message: 'ข้อมูลตรงกัน พร้อมเพิ่มเข้ารายวิชา',
    course,
  };
}

@Injectable()
export class TimetablesService {
  constructor(
    private readonly ocr: LeaveOcrClient,
    private readonly courses: CoursesService,
    private readonly schedules: SchedulesService,
    private readonly rooms: RoomsRepo,
    private readonly repo: TimetablesRepo,
    @Inject(ROSTER_REPO) private readonly roster: RosterRepo,
  ) {}

  private student(user: AppUser): string {
    if (user.role !== 'student' || !user.studentId)
      throw new AppError(
        403,
        'STUDENT_REQUIRED',
        'ต้องใช้บัญชีนักศึกษาที่มีรหัสนักศึกษา',
      );
    return user.studentId;
  }
  private staff(user: AppUser) {
    if (user.role !== 'teacher' && user.role !== 'admin')
      throw new AppError(403, 'FORBIDDEN', 'เฉพาะอาจารย์และผู้ดูแลระบบ');
  }
  async preview(user: AppUser, file?: TimetableFile, courseId?: string) {
    if (courseId) {
      this.staff(user);
      await this.courses.getOwned(user, courseId);
    } else this.student(user);
    if (!file)
      throw new AppError(400, 'DOCUMENT_REQUIRED', 'กรุณาเลือกไฟล์ตารางเรียน');
    if (
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      file.size !== file.buffer.length
    )
      throw new AppError(413, 'DOCUMENT_SIZE', 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
    if (
      !(file.mimetype === 'application/pdf'
        ? file.buffer.subarray(0, 5).toString() === '%PDF-'
        : looksLike(file.mimetype, file.buffer))
    )
      throw new AppError(
        400,
        'DOCUMENT_TYPE',
        'รองรับ PDF, JPG และ PNG เท่านั้น',
      );
    const draft = extractTimetable(
      (await this.ocr.readTimetableDocument(file.buffer, file.mimetype)).lines,
    );
    return {
      ...draft,
      matches: courseId
        ? []
        : await this.matches(user, { rows: draft.rows }, true),
    };
  }
  async matches(user: AppUser, body: unknown, allowEmpty = false) {
    this.student(user);
    if (allowEmpty && (body as { rows: unknown[] }).rows.length === 0)
      return [];
    const { rows } = parseBody(importSchema, body);
    const candidates = await this.repo.candidates(
      rows.map((row) => row.courseCode),
    );
    return rows.map((row) => matchTimetableRow(row, candidates));
  }
  async enroll(user: AppUser, body: unknown) {
    const studentCode = this.student(user);
    const { rows } = parseBody(importSchema, body);
    const matches = await this.matches(user, { rows });
    const completed = new Set<string>();
    const results: {
      index: number;
      status: string;
      message: string;
      courseId?: string;
    }[] = [];
    for (const [index, match] of matches.entries()) {
      if (!match.course) {
        results.push({ index, status: match.status, message: match.message });
        continue;
      }
      const courseId = match.course.id;
      try {
        const exists =
          completed.has(courseId) ||
          (await this.roster.listCodes(courseId)).includes(studentCode);
        if (!exists) await this.roster.addCodes(courseId, [studentCode]);
        completed.add(courseId);
        results.push({
          index,
          courseId,
          status: exists ? 'existing' : 'enrolled',
          message: exists
            ? 'มีชื่อในรายวิชานี้แล้ว'
            : 'เพิ่มชื่อเข้ารายวิชาแล้ว',
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        results.push({ index, status: 'failed', message: error.message });
      }
    }
    return { results };
  }
  async importCourse(user: AppUser, courseId: string, body: unknown) {
    this.staff(user);
    const course = await this.courses.getOwned(user, courseId);
    const { rows } = parseBody(importSchema, body);
    const rooms = await this.rooms.list();
    const existing = await this.schedules.list(user, courseId);
    const results: { index: number; status: string; message: string }[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        if (
          normalizeCode(row.courseCode) !== normalizeCode(course.code) ||
          (row.section &&
            normalizeSection(row.section) !==
              normalizeSection(course.section ?? ''))
        )
          throw new AppError(
            400,
            'COURSE_MISMATCH',
            'รหัสวิชาหรือกลุ่มไม่ตรงกับวิชานี้',
          );
        if (
          row.weekday === null ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime)
        )
          throw new AppError(400, 'INVALID_TIME', 'กรุณาระบุวันและเวลาให้ครบ');
        checkTimes(row.startTime, row.endTime);
        const hits = rooms.filter(
          (room) => normalizeCode(room.name) === normalizeCode(row.roomName),
        );
        if (hits.length !== 1)
          throw new AppError(
            400,
            'ROOM_NOT_FOUND',
            'กรุณาเลือกห้องที่มีในระบบ',
          );
        const roomId = hits[0].id;
        if (
          existing.some(
            (s) =>
              s.weekday === row.weekday &&
              s.startTime === row.startTime &&
              s.endTime === row.endTime &&
              s.roomId === roomId,
          )
        ) {
          results.push({
            index,
            status: 'existing',
            message: 'มีตารางนี้แล้ว',
          });
          continue;
        }
        const saved = await this.schedules.create(user, courseId, {
          weekday: row.weekday,
          startTime: row.startTime,
          endTime: row.endTime,
          roomId,
        });
        existing.push(saved);
        results.push({ index, status: 'imported', message: 'บันทึกตารางแล้ว' });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        results.push({ index, status: 'failed', message: error.message });
      }
    }
    return { results };
  }
}
