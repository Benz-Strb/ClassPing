import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  extractTimetable,
  normalizeName,
  type TimetableRow,
} from './timetable-draft.js';
import { matchTimetableRow, TimetablesService } from './timetables.service.js';
import type { MatchCourse, TimetablesRepo } from './timetables.repo.js';
import type { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import type { CoursesService } from '../courses/courses.service.js';
import type { SchedulesService } from '../schedules/schedules.service.js';
import type { RoomsRepo } from '../rooms/rooms.repo.js';
import type { RosterRepo } from '../courses/roster.repo.js';
import type { AppUser } from '../users/users.service.js';

const row: TimetableRow = {
  courseCode: 'CE360',
  courseName: 'Software',
  section: '001',
  teacherName: 'อ. สมชาย ใจดี',
  weekday: 1,
  startTime: '09:00',
  endTime: '12:00',
  roomName: '101',
};
const course: MatchCourse = {
  id: 'course-1',
  code: 'CE360',
  name: 'Software',
  section: '001',
  teacherName: 'สมชาย ใจดี',
  schedules: [
    { weekday: 1, startTime: '09:00', endTime: '12:00', roomName: '101' },
  ],
};
const student = {
  id: 'student-1',
  studentId: '650001',
  role: 'student',
} as AppUser;
const teacher = { id: 'teacher-1', role: 'teacher' } as AppUser;

describe('timetable extraction', () => {
  it('reads Thai Markdown tables and preserves instructor, section and times', () => {
    const draft = extractTimetable([
      { text: '| รหัสวิชา | ชื่อวิชา | กลุ่ม | อาจารย์ | วัน | เวลา | ห้อง |' },
      { text: '| --- | --- | --- | --- | --- | --- | --- |' },
      {
        text: '| CE360 | Software | 001 | สมชาย ใจดี | จันทร์ | 09.00–12.00 | 101 |',
      },
    ]);
    expect(draft.rows).toEqual([{ ...row, teacherName: 'สมชาย ใจดี' }]);
  });
  it('reads HTML tables produced by OCR', () => {
    const draft = extractTimetable([
      {
        text: '<table><tr><th>รหัสวิชา</th><th>วัน</th><th>เวลา</th><th>ผู้สอน</th></tr><tr><td>CE360</td><td>อังคาร</td><td>13:00-16:00</td><td>สมชาย ใจดี</td></tr></table>',
      },
    ]);
    expect(draft.rows[0]).toMatchObject({
      courseCode: 'CE360',
      weekday: 2,
      startTime: '13:00',
      teacherName: 'สมชาย ใจดี',
    });
  });
  it('reads multiline plain text without inventing missing data', () => {
    const draft = extractTimetable([
      { text: 'CE360 กลุ่ม 001 วันจันทร์ 09:00-12:00' },
      { text: 'อาจารย์ สมชาย ใจดี ห้อง 101' },
      { text: 'MA101 วันอังคาร 13:00-15:00' },
    ]);
    expect(draft.rows[0]).toEqual({
      ...row,
      teacherName: 'สมชาย ใจดี',
      courseName: '',
    });
    expect(draft.rows[1]).toMatchObject({
      teacherName: '',
      section: '',
      roomName: '',
      weekday: 2,
    });
  });
  it('returns an empty review draft for unreadable content', () => {
    expect(extractTimetable([{ text: 'ตารางเรียน ภาคการศึกษา' }]).rows).toEqual(
      [],
    );
  });
  it('removes titles only from the beginning of instructor names', () => {
    expect(normalizeName('ผศ. ดร. สมชาย ใจดี')).toBe(
      normalizeName('สมชาย ใจดี'),
    );
    expect(normalizeName('Andrew Smith')).toBe('andrewsmith');
  });
});

describe('strict student timetable matching', () => {
  it('matches normalized course code and numeric section', () => {
    expect(
      matchTimetableRow({ ...row, courseCode: 'ce 360', section: '1' }, [
        course,
      ]).status,
    ).toBe('matched');
  });
  it.each([
    { teacherName: 'สมชาย คนอื่น' },
    { weekday: 2 },
    { startTime: '10:00' },
    { endTime: '13:00' },
    { section: '002' },
    { courseCode: 'CE361' },
    { roomName: '102' },
  ])('rejects a mismatch: %j', (patch) => {
    expect(matchTimetableRow({ ...row, ...patch }, [course]).status).toBe(
      'unmatched',
    );
  });
  it('does not choose the first of ambiguous groups', () => {
    expect(
      matchTimetableRow({ ...row, section: '' }, [
        course,
        { ...course, id: 'course-2', section: '002' },
      ]).status,
    ).toBe('ambiguous');
  });
  it('requires an instructor and a complete timeslot', () => {
    expect(
      matchTimetableRow({ ...row, teacherName: '' }, [course]).status,
    ).toBe('unmatched');
    expect(matchTimetableRow({ ...row, weekday: null }, [course]).status).toBe(
      'unmatched',
    );
  });
});

describe('timetable import and enrollment', () => {
  const ocr = { readTimetableDocument: vi.fn() };
  const courses = { getOwned: vi.fn() };
  const schedules = { list: vi.fn(), create: vi.fn() };
  const rooms = { list: vi.fn() };
  const repo = { candidates: vi.fn() };
  const roster = { listCodes: vi.fn(), addCodes: vi.fn() };
  const service = new TimetablesService(
    ocr as unknown as LeaveOcrClient,
    courses as unknown as CoursesService,
    schedules as unknown as SchedulesService,
    rooms as unknown as RoomsRepo,
    repo as unknown as TimetablesRepo,
    roster as unknown as RosterRepo,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    repo.candidates.mockResolvedValue([course]);
    roster.listCodes.mockResolvedValue([]);
    roster.addCodes.mockResolvedValue(undefined);
    courses.getOwned.mockResolvedValue({
      id: course.id,
      code: course.code,
      section: course.section,
    });
    rooms.list.mockResolvedValue([{ id: 'room-1', name: '101' }]);
    schedules.list.mockResolvedValue([]);
    schedules.create.mockResolvedValue({
      ...row,
      id: 'schedule-1',
      roomId: 'room-1',
    });
  });
  it('uses only the authenticated student code and rechecks submitted course ids', async () => {
    const result = await service.enroll(student, {
      rows: [{ ...row, courseId: 'forged-course' }],
      studentCode: 'someone-else',
    });
    expect(result.results[0].status).toBe('enrolled');
    expect(roster.addCodes).toHaveBeenCalledWith(course.id, [
      student.studentId,
    ]);
  });
  it('does not enroll unmatched or ambiguous rows', async () => {
    await service.enroll(student, {
      rows: [{ ...row, teacherName: 'คนอื่น' }],
    });
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('handles duplicate rows and previously enrolled students without duplicate inserts', async () => {
    await service.enroll(student, { rows: [row, row] });
    expect(roster.addCodes).toHaveBeenCalledTimes(1);
    roster.listCodes.mockResolvedValue([student.studentId]);
    roster.addCodes.mockClear();
    expect(
      (await service.enroll(student, { rows: [row] })).results[0].status,
    ).toBe('existing');
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('revalidates against changed schedules at confirmation', async () => {
    expect((await service.matches(student, { rows: [row] }))[0].status).toBe(
      'matched',
    );
    repo.candidates.mockResolvedValue([{ ...course, schedules: [] }]);
    expect(
      (await service.enroll(student, { rows: [row] })).results[0].status,
    ).toBe('unmatched');
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('checks ownership before reading teacher uploads', async () => {
    courses.getOwned.mockRejectedValue(new Error('not owned'));
    await expect(
      service.preview(teacher, undefined, course.id),
    ).rejects.toThrow('not owned');
    expect(ocr.readTimetableDocument).not.toHaveBeenCalled();
  });
  it('rejects a disguised image before OCR', async () => {
    await expect(
      service.preview(student, {
        size: 3,
        buffer: Buffer.from('bad'),
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_TYPE' });
    expect(ocr.readTimetableDocument).not.toHaveBeenCalled();
  });
  it('rejects student access to teacher imports', async () => {
    await expect(
      service.importCourse(student, course.id, { rows: [row] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('uses the existing schedule conflict checks and returns per-row outcomes', async () => {
    const { AppError } = await import('../common/app-error.js');
    schedules.create.mockRejectedValue(
      new AppError(409, 'ROOM_CONFLICT', 'ห้องไม่ว่าง'),
    );
    expect(
      (await service.importCourse(teacher, course.id, { rows: [row] }))
        .results[0],
    ).toMatchObject({ status: 'failed', message: 'ห้องไม่ว่าง' });
  });
  it('does not import other course codes or sections', async () => {
    const result = await service.importCourse(teacher, course.id, {
      rows: [
        { ...row, courseCode: 'MA101' },
        { ...row, section: '002' },
      ],
    });
    expect(result.results.every((r) => r.status === 'failed')).toBe(true);
    expect(schedules.create).not.toHaveBeenCalled();
  });
  it('does not import repeated schedules', async () => {
    schedules.list.mockResolvedValue([{ ...row, roomId: 'room-1' }]);
    expect(
      (await service.importCourse(teacher, course.id, { rows: [row] }))
        .results[0].status,
    ).toBe('existing');
    expect(schedules.create).not.toHaveBeenCalled();
  });
});
