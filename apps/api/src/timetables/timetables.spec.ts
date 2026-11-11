import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  extractTimetable,
  normalizeName,
  type TimetableRow,
} from './timetable-draft.js';
import { matchTimetableRow, TimetablesService } from './timetables.service.js';
import { signTimetableIdentity } from './timetable-identity.js';
import type { AppConfig } from '../config/config.js';
import { timetableExpiry } from './saved-timetable.js';
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
  studentId: '65000001', fullName: 'นายสมชาย ใจดี',
  role: 'student',
} as AppUser;
const identity = { studentId: student.studentId!, fullName: student.fullName! };
// หลักฐานจากเอกสารที่มีวิชา CE360 กลุ่ม 001
const ownershipProof = signTimetableIdentity(student.id, identity, '2099-01-01T00:00:00Z', 'test-secret', [{ code: 'CE360', section: '001' }]);
const teacher = { id: 'teacher-1', role: 'teacher' } as AppUser;

describe('timetable extraction', () => {
  it('extracts all seven fields and both CE360 meetings from the DPU registration report', () => {
    const text = readFileSync(new URL('./fixtures/dpu-registration.txt', import.meta.url), 'utf8');
    const draft = extractTimetable(text.split('\n').map(text => ({ text })));
    expect(draft.rows).toEqual([
      { courseCode: 'LW391', courseName: 'กฎหมายและจรรยาบรรณทางวิชาชีพเทคโนโลยีสารสนเทศ', section: '001', teacherName: 'ดร.จิรวุฒิ ลิปิพันธ์', weekday: 2, startTime: '13:30', endTime: '16:30', roomName: '51106' },
      ...[1, 2].map(weekday => ({ courseCode: 'CE360', courseName: 'เทคโนโลยีบล็อกเชน', section: '511', teacherName: 'ดร.เด่นเดช รักษ์รัตนตรัย', weekday, startTime: '09:00', endTime: '10:30', roomName: '51106' })),
      { courseCode: 'CE452', courseName: 'ความมั่นคงในเครือข่ายคอมพิวเตอร์', section: '511', teacherName: 'ผศ.ดร.ชัยพร เขมะภาตะพันธ์', weekday: 3, startTime: '09:00', endTime: '12:00', roomName: '51103' },
      { courseCode: 'IG342', courseName: 'การพัฒนาแอปพลิเคชันบนอุปกรณ์เคลื่อนที่ 1', section: '501', teacherName: 'อ.ณพล ศิริภิบาล', weekday: 5, startTime: '09:00', endTime: '12:00', roomName: '61102' },
      { courseCode: 'CE498', courseName: 'โครงงานวิศวกรรมคอมพิวเตอร์ 1', section: '315', teacherName: 'อ.ศุภดา สุทธา', weekday: 4, startTime: '09:00', endTime: '12:00', roomName: 'ออนไลน์' },
    ]);
  });
  it('reads multiple meetings from the combined day/time/room column in OCR tables', () => {
    const draft = extractTimetable([{ text: '<table><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>กลุ่มเรียน</th><th>ห้องเรียน/วันเวลาเรียน</th><th>อาจารย์ผู้สอน</th></tr><tr><td>CE360</td><td>เทคโนโลยีบล็อกเชน</td><td>511</td><td>จ. 09:00-10:30 ห้อง 51106<br>อ. 09:00-10:30 ห้อง 51106</td><td>ดร.เด่นเดช รักษ์รัตนตรัย</td></tr></table>' }]);
    expect(draft.rows).toHaveLength(2);
    expect(draft.rows.map(row => row.weekday)).toEqual([1, 2]);
    expect(draft.rows.every(row => row.roomName === '51106' && row.section === '511' && row.teacherName === 'ดร.เด่นเดช รักษ์รัตนตรัย')).toBe(true);
  });
  it('reads all seven fields from labeled multiline OCR with numeric course codes', () => {
    const draft = extractTimetable([
      { text: 'รหัสวิชา: 01234567' },
      { text: 'ชื่อวิชา: การพัฒนาโปรแกรม กลุ่มเรียน: 001' },
      { text: 'ห้องเรียน: อาคาร 1 ห้อง 101 วัน: จันทร์ เวลาเรียน: 09.00–12.00' },
      { text: 'อาจารย์ผู้สอน: ผศ. ดร. สมชาย ใจดี' },
    ]);
    expect(draft.rows).toEqual([{
      ...row, courseCode: '01234567', courseName: 'การพัฒนาโปรแกรม',
      roomName: 'อาคาร 1 ห้อง 101', teacherName: 'ผศ. ดร. สมชาย ใจดี',
    }]);
  });
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
  const repo = { candidates: vi.fn(), saved: vi.fn(), save: vi.fn() };
  const roster = { listCodes: vi.fn(), addCodes: vi.fn() };
  const service = new TimetablesService(
    ocr as unknown as LeaveOcrClient,
    courses as unknown as CoursesService,
    schedules as unknown as SchedulesService,
    rooms as unknown as RoomsRepo,
    repo as unknown as TimetablesRepo,
    roster as unknown as RosterRepo,
    { supabaseServiceRoleKey: 'test-secret' } as AppConfig,
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
  it('saves reviewed rows against the authenticated user even without a course match', async () => {
    repo.save.mockImplementation(async (_id, value) => value);
    const saved = await service.save(student, { ownershipProof,
      rows: [row], userId: 'another-user', expiresAt: '2099-01-01',
    });
    expect(repo.save).toHaveBeenCalledWith(student.id, saved);
    expect(saved.rows).toEqual([row]);
    expect(saved.expiresAt).toBe(timetableExpiry(new Date(saved.savedAt)));
    expect(repo.candidates).not.toHaveBeenCalled();
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('loads only the authenticated user timetable', async () => {
    repo.saved.mockResolvedValue(null);
    expect(await service.saved(student)).toBeNull();
    expect(repo.saved).toHaveBeenCalledWith(student.id);
  });
  it.each([{ courseName: '' }, { weekday: null }, { startTime: '25:00' }, { endTime: '08:00' }])('rejects incomplete reviewed rows: %j', async patch => {
    await expect(service.save(student, { ownershipProof, rows: [{ ...row, ...patch }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects non-students before reading or saving personal timetables', async () => {
    await expect(service.saved(teacher)).rejects.toMatchObject({ code: 'STUDENT_REQUIRED' });
    await expect(service.save(teacher, { rows: [row] })).rejects.toMatchObject({ code: 'STUDENT_REQUIRED' });
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.saved).not.toHaveBeenCalled();
  });
  it('keeps reviewed rows retryable when persistence fails', async () => {
    repo.save.mockRejectedValue(new Error('database unavailable'));
    await expect(service.save(student, { ownershipProof, rows: [row] })).rejects.toThrow('database unavailable');
  });
  it('uses only the authenticated student code and rechecks submitted course ids', async () => {
    const result = await service.enroll(student, { ownershipProof,
      rows: [{ ...row, courseId: 'forged-course' }],
      studentCode: 'someone-else',
    });
    expect(result.results[0].status).toBe('enrolled');
    expect(roster.addCodes).toHaveBeenCalledWith(course.id, [
      student.studentId,
    ]);
  });
  it('does not enroll courses that were not in the uploaded document', async () => {
    const other = { ...course, id: 'course-2', code: 'CE452' };
    repo.candidates.mockResolvedValue([course, other]);
    const result = await service.enroll(student, { ownershipProof,
      rows: [{ ...row, courseCode: 'CE452' }],
    });
    expect(result.results[0]).toMatchObject({ status: 'failed' });
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('rejects older proofs without document courses until the timetable is uploaded again', async () => {
    const old = signTimetableIdentity(student.id, identity, '2099-01-01T00:00:00Z', 'test-secret');
    const result = await service.enroll(student, { ownershipProof: old, rows: [row] });
    expect(result.results[0]).toMatchObject({ status: 'failed' });
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('keeps the document courses when saving edited rows', async () => {
    repo.save.mockImplementation(async (_id, value) => value);
    const saved = await service.save(student, { ownershipProof, rows: [{ ...row, courseCode: 'CE452' }] });
    repo.candidates.mockResolvedValue([course, { ...course, id: 'course-2', code: 'CE452' }]);
    const result = await service.enroll(student, { ownershipProof: saved.ownershipProof,
      rows: [{ ...row, courseCode: 'CE452' }, row],
    });
    expect(result.results.map((r) => r.status)).toEqual(['failed', 'enrolled']);
    expect(roster.addCodes).toHaveBeenCalledTimes(1);
  });
  it('does not enroll unmatched or ambiguous rows', async () => {
    await service.enroll(student, { ownershipProof,
      rows: [{ ...row, teacherName: 'คนอื่น' }],
    });
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('handles duplicate rows and previously enrolled students without duplicate inserts', async () => {
    await service.enroll(student, { ownershipProof, rows: [row, row] });
    expect(roster.addCodes).toHaveBeenCalledTimes(1);
    roster.listCodes.mockResolvedValue([student.studentId]);
    roster.addCodes.mockClear();
    expect(
      (await service.enroll(student, { ownershipProof, rows: [row] })).results[0].status,
    ).toBe('existing');
    expect(roster.addCodes).not.toHaveBeenCalled();
  });
  it('revalidates against changed schedules at confirmation', async () => {
    expect((await service.matches(student, { rows: [row] }))[0].status).toBe(
      'matched',
    );
    repo.candidates.mockResolvedValue([{ ...course, schedules: [] }]);
    expect(
      (await service.enroll(student, { ownershipProof, rows: [row] })).results[0].status,
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
  it('verifies document owner before returning the preview and issues a server proof', async () => {
    ocr.readTimetableDocument.mockResolvedValue({ lines: [{ text: 'เลขทะเบียน : 65000001 นายสมชาย ใจดี' }] });
    const buffer = Buffer.from('%PDF-test');
    const draft = await service.preview(student, { buffer, size: buffer.length, mimetype: 'application/pdf' });
    expect(draft.identity).toEqual(identity);
    expect(draft.ownershipProof).toEqual(expect.any(String));
  });
  it('rejects another student document automatically during upload', async () => {
    ocr.readTimetableDocument.mockResolvedValue({ lines: [{ text: 'เลขทะเบียน : 65000002 นายสมชาย ใจดี' }] });
    const buffer = Buffer.from('%PDF-test');
    await expect(service.preview(student, { buffer, size: buffer.length, mimetype: 'application/pdf' })).rejects.toMatchObject({ code: 'TIMETABLE_OWNER_MISMATCH' });
    expect(repo.candidates).not.toHaveBeenCalled();
  });
  it('requires a valid ownership proof to save or enroll even when clients bypass preview', async () => {
    await expect(service.save(student, { rows: [row], ownershipProof: 'forged' })).rejects.toMatchObject({ code: 'TIMETABLE_VERIFICATION_REQUIRED' });
    await expect(service.enroll(student, { rows: [row], ownershipProof: 'forged' })).rejects.toMatchObject({ code: 'TIMETABLE_VERIFICATION_REQUIRED' });
    expect(repo.save).not.toHaveBeenCalled();
    expect(roster.addCodes).not.toHaveBeenCalled();
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
