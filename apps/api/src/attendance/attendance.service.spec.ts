import { AppError } from '../common/app-error.js';
import type { CoursesService } from '../courses/courses.service.js';
import type { RosterService } from '../courses/roster.service.js';
import type { AppUser } from '../users/users.service.js';
import type {
  AttendanceAdminRepo,
  SessionInfo,
  StoredAttendance,
  UnknownFace,
} from './attendance-admin.repo.js';
import { AttendanceService } from './attendance.service.js';

const START = new Date('2026-10-23T02:00:00Z'); // 09:00
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const teacher: AppUser = {
  id: 't1',
  email: 'somsak@dpu.ac.th',
  fullName: 'สมศักดิ์',
  role: 'teacher',
  studentId: null,
  pdpaConsentAt: null,
};
const student: AppUser = { ...teacher, id: 'x', role: 'student' };

const session: SessionInfo = {
  id: SESSION_ID,
  courseId: 'c1',
  scheduleId: 'sch1',
  roomId: 'r1',
  roomName: 'ห้องทดลอง 1',
  onDate: '2026-10-23',
  startsAt: START,
  endsAt: new Date('2026-10-23T05:00:00Z'),
};

const roster = [
  { studentCode: '66000001', userId: 'u1', fullName: 'หนึ่ง', hasLoggedIn: true, faceEnrolled: true },
  { studentCode: '66000002', userId: 'u2', fullName: 'สอง', hasLoggedIn: true, faceEnrolled: true },
  { studentCode: '66000003', userId: 'u3', fullName: 'สาม', hasLoggedIn: true, faceEnrolled: false },
  { studentCode: '66000004', userId: null, fullName: null, hasLoggedIn: false, faceEnrolled: false },
];

const at = (minute: number) => new Date(START.getTime() + minute * 60_000);

class FakeRepo implements AttendanceAdminRepo {
  rows = new Map<string, StoredAttendance>();
  unknown: UnknownFace[] = [];
  signed: string[][] = [];

  async session(id: string) {
    return id === SESSION_ID ? session : null;
  }
  async rules() {
    return { lateAfterMin: 15, absentAfterMin: null, outOfRoomLimitMin: 15 };
  }
  async listBySession() {
    return [...this.rows.values()];
  }
  async recentUnknown(_s: string, limit: number) {
    return this.unknown.slice(0, limit);
  }
  async signCaptures(paths: string[]) {
    this.signed.push(paths);
    return new Map(paths.map((p) => [p, `https://signed/${p}`]));
  }
  async setStatus(_s: string, userId: string, status: StoredAttendance['status'], teacherId: string) {
    const row = this.rows.get(userId);
    this.rows.set(userId, {
      userId,
      status,
      firstSeenAt: row?.firstSeenAt ?? null,
      confidence: row?.confidence ?? null,
      imagePath: row?.imagePath ?? null,
      updatedBy: teacherId,
      updatedByName: 'สมศักดิ์',
    });
  }
  async moveRow(
    _s: string,
    from: string,
    to: string,
    status: StoredAttendance['status'],
    teacherId: string,
  ) {
    const row = this.rows.get(from)!;
    this.rows.delete(from);
    this.rows.set(to, { ...row, userId: to, status, updatedBy: teacherId, updatedByName: 'สมศักดิ์' });
  }
  async deleteRow(_s: string, userId: string) {
    this.rows.delete(userId);
  }
  async insertUnknown(_s: string, imagePath: string, seenAt: Date) {
    this.unknown.unshift({ imagePath, seenAt });
  }
}

function setup() {
  const repo = new FakeRepo();
  const courses = {
    getOwned: async (user: AppUser, courseId: string) => {
      if (user.role !== 'admin' && user.id !== 't1') {
        throw new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบวิชานี้');
      }
      return { id: courseId, code: 'CS101', name: 'x', section: null, teacherId: 't1' };
    },
  } as unknown as CoursesService;
  const rosterService = { entries: async () => roster } as unknown as RosterService;
  const service = new AttendanceService(courses, rosterService, repo, () => at(30));
  const pending = (userId: string, minute = 5) =>
    repo.rows.set(userId, {
      userId,
      status: 'pending',
      firstSeenAt: at(minute),
      confidence: 0.42,
      imagePath: `${SESSION_ID}/${userId}-x.jpg`,
      updatedBy: null,
      updatedByName: null,
    });
  return { repo, service, pending };
}

describe('AttendanceService.view', () => {
  it('ทุกคนในรายชื่อ รอตรวจขึ้นก่อน คนที่ยังไม่เห็นได้สถานะ null', async () => {
    const { service, pending, repo } = setup();
    pending('u2');
    repo.unknown = [{ imagePath: `${SESSION_ID}/unknown-1.jpg`, seenAt: at(3) }];

    const view = await service.view(teacher, SESSION_ID);
    expect(view.session).toMatchObject({ id: SESSION_ID, status: 'live', roomName: 'ห้องทดลอง 1' });
    expect(view.rows.map((r) => [r.studentCode, r.status])).toEqual([
      ['66000002', 'pending'],
      ['66000001', null],
      ['66000003', null],
      ['66000004', null],
    ]);
    expect(view.rows[0]).toMatchObject({
      fullName: 'สอง',
      confidence: 0.42,
      firstSeenAt: at(5).toISOString(),
      imageUrl: `https://signed/${SESSION_ID}/u2-x.jpg`,
      updatedBy: null,
    });
    expect(view.rows[2].faceEnrolled).toBe(false);
    expect(view.unknown).toEqual([
      { imageUrl: `https://signed/${SESSION_ID}/unknown-1.jpg`, seenAt: at(3).toISOString() },
    ]);
    // เซ็น URL รวดเดียวต่อ request
    expect(repo.signed).toHaveLength(1);
  });

  it('อาจารย์วิชาอื่น หรือ id คาบไม่มีอยู่ ได้ 404 SESSION_NOT_FOUND', async () => {
    const { service } = setup();
    const other = { ...teacher, id: 't2' };
    await expect(service.view(other, SESSION_ID)).rejects.toMatchObject({
      status: 404,
      code: 'SESSION_NOT_FOUND',
    });
    await expect(service.view(teacher, 'nope')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('แอดมินดูได้ทุกวิชา', async () => {
    const { service } = setup();
    await expect(service.view({ ...teacher, id: 'a1', role: 'admin' }, SESSION_ID)).resolves.toBeDefined();
  });
});

describe('AttendanceService.setStatus', () => {
  it('อาจารย์ตั้งสถานะเองได้ และจำว่าใครแก้', async () => {
    const { service, repo } = setup();
    await service.setStatus(teacher, SESSION_ID, '66000001', { status: 'absent' });
    expect(repo.rows.get('u1')).toMatchObject({ status: 'absent', updatedBy: 't1' });
  });

  it('ตั้งเป็น leave หรือ pending ไม่ได้', async () => {
    const { service } = setup();
    for (const status of ['leave', 'pending', 'x']) {
      await expect(
        service.setStatus(teacher, SESSION_ID, '66000001', { status }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('รหัสไม่อยู่ในวิชาได้ 404 / ยังไม่เคย login ได้ 409 NO_ACCOUNT', async () => {
    const { service } = setup();
    await expect(
      service.setStatus(teacher, SESSION_ID, '99999999', { status: 'present' }),
    ).rejects.toMatchObject({ status: 404, code: 'STUDENT_NOT_IN_COURSE' });
    await expect(
      service.setStatus(teacher, SESSION_ID, '66000004', { status: 'present' }),
    ).rejects.toMatchObject({ status: 409, code: 'NO_ACCOUNT' });
  });
});

describe('AttendanceService.review', () => {
  it('ยืนยัน: สถานะคิดจากเวลาที่เห็นตามเกณฑ์', async () => {
    const { service, repo, pending } = setup();
    pending('u1', 5);
    pending('u2', 20);
    await service.review(teacher, SESSION_ID, '66000001', { action: 'confirm' });
    await service.review(teacher, SESSION_ID, '66000002', { action: 'confirm' });
    expect(repo.rows.get('u1')).toMatchObject({ status: 'present', updatedBy: 't1' });
    expect(repo.rows.get('u2')).toMatchObject({ status: 'late' });
  });

  it('เปลี่ยนคน: ย้ายรูปและเวลาไปคนใหม่', async () => {
    const { service, repo, pending } = setup();
    pending('u1', 20);
    await service.review(teacher, SESSION_ID, '66000001', { action: 'reassign', toCode: '66000003' });
    expect(repo.rows.has('u1')).toBe(false);
    expect(repo.rows.get('u3')).toMatchObject({
      status: 'late',
      imagePath: `${SESSION_ID}/u1-x.jpg`,
      updatedBy: 't1',
    });
  });

  it('เปลี่ยนไปเป็นคนที่มีผลอยู่แล้วได้ 409 ไม่ทำแถวหาย', async () => {
    const { service, repo, pending } = setup();
    pending('u1');
    await service.setStatus(teacher, SESSION_ID, '66000002', { status: 'present' });
    await expect(
      service.review(teacher, SESSION_ID, '66000001', { action: 'reassign', toCode: '66000002' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_RECORDED' });
    expect(repo.rows.get('u1')?.status).toBe('pending');
  });

  it('เปลี่ยนไปเป็นรหัสที่ไม่อยู่ในวิชา 404 / ยังไม่เคย login 409', async () => {
    const { service, pending } = setup();
    pending('u1');
    await expect(
      service.review(teacher, SESSION_ID, '66000001', { action: 'reassign', toCode: '12345678' }),
    ).rejects.toMatchObject({ status: 404, code: 'STUDENT_NOT_IN_COURSE' });
    await expect(
      service.review(teacher, SESSION_ID, '66000001', { action: 'reassign', toCode: '66000004' }),
    ).rejects.toMatchObject({ status: 409, code: 'NO_ACCOUNT' });
  });

  it('ไม่ใช่นักศึกษาวิชานี้: ลบแถว รูปย้ายไปหน้าที่ไม่รู้จัก', async () => {
    const { service, repo, pending } = setup();
    pending('u1', 5);
    await service.review(teacher, SESSION_ID, '66000001', { action: 'reject' });
    expect(repo.rows.has('u1')).toBe(false);
    expect(repo.unknown).toEqual([{ imagePath: `${SESSION_ID}/u1-x.jpg`, seenAt: at(5) }]);
  });

  it('แถวที่ไม่ได้รอตรวจได้ 409 NOT_PENDING', async () => {
    const { service } = setup();
    await service.setStatus(teacher, SESSION_ID, '66000001', { status: 'present' });
    await expect(
      service.review(teacher, SESSION_ID, '66000001', { action: 'confirm' }),
    ).rejects.toMatchObject({ status: 409, code: 'NOT_PENDING' });
    await expect(
      service.review(teacher, SESSION_ID, '66000002', { action: 'confirm' }),
    ).rejects.toMatchObject({ status: 409, code: 'NOT_PENDING' });
  });

  it('action ผิดได้ 400', async () => {
    const { service, pending } = setup();
    pending('u1');
    await expect(
      service.review(teacher, SESSION_ID, '66000001', { action: 'delete' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('นักศึกษาเรียกไม่ได้ (ไม่ใช่เจ้าของวิชา) ได้ 404', async () => {
    const { service } = setup();
    await expect(service.view(student, SESSION_ID)).rejects.toMatchObject({ status: 404 });
  });
});
