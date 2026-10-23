import { randomUUID } from 'node:crypto';
import type { AppUser } from '../users/users.service.js';
import type { Course, CoursesRepo } from './courses.repo.js';
import { CoursesService } from './courses.service.js';
import type { RosterRepo, StudentAccount } from './roster.repo.js';
import { RosterService } from './roster.service.js';

// enrollments + users + face_profiles ปลอมในหน่วยความจำ
class InMemoryRosterRepo implements RosterRepo {
  enrollments = new Map<string, Set<string>>();
  accounts: StudentAccount[] = [];
  faceUserIds = new Set<string>();

  async listCodes(courseId: string) {
    return [...(this.enrollments.get(courseId) ?? [])].sort();
  }
  async addCodes(courseId: string, codes: string[]) {
    const set = this.enrollments.get(courseId) ?? new Set<string>();
    codes.forEach((c) => set.add(c));
    this.enrollments.set(courseId, set);
  }
  async removeCode(courseId: string, code: string) {
    return this.enrollments.get(courseId)?.delete(code) ?? false;
  }
  async accountsByCodes(codes: string[]) {
    return this.accounts.filter((a) => codes.includes(a.studentCode));
  }
  async faceEnrolledUserIds(userIds: string[]) {
    return userIds.filter((id) => this.faceUserIds.has(id));
  }
}

const user = (role: AppUser['role'] = 'teacher'): AppUser => ({
  id: randomUUID(),
  email: 'x@dpu.ac.th',
  fullName: null,
  role,
  studentId: null,
  pdpaConsentAt: null,
  identityVerifiedAt: null,
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; code: string; message: string };
    return { status: e.getStatus(), code: e.code, message: e.message };
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

function setup() {
  const owner = user();
  const course: Course = {
    id: randomUUID(),
    code: 'CS101',
    name: 'x',
    section: null,
    teacherId: owner.id,
  };
  const courses = new CoursesService({
    findById: async (id: string) => (id === course.id ? course : null),
  } as unknown as CoursesRepo);
  const repo = new InMemoryRosterRepo();
  return { owner, course, repo, service: new RosterService(courses, repo) };
}

describe('RosterService', () => {
  it('เพิ่มแล้วแยกผล เพิ่มใหม่ / มีอยู่แล้ว / ไม่ถูกต้อง', async () => {
    const { owner, course, service } = setup();
    await service.add(owner, course.id, { codes: '66112106' });

    expect(
      await service.add(owner, course.id, { codes: '66112106\n66112126 abc 66112126' }),
    ).toEqual({ added: ['66112126'], alreadyEnrolled: ['66112106'], invalid: ['abc'] });
  });

  it('วางครั้งละเกิน 500 รหัสได้ 400', async () => {
    const { owner, course, service } = setup();
    const codes = Array.from({ length: 501 }, (_, i) => String(66000000 + i)).join('\n');
    expect(await rejection(service.add(owner, course.id, { codes }))).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('วาง 200 รหัสครั้งเดียวได้ครบ', async () => {
    const { owner, course, service } = setup();
    const codes = Array.from({ length: 200 }, (_, i) => String(66000000 + i)).join(', ');
    expect((await service.add(owner, course.id, { codes })).added).toHaveLength(200);
  });

  it('body ไม่มี codes ได้ 400', async () => {
    const { owner, course, service } = setup();
    expect((await rejection(service.add(owner, course.id, {}))).status).toBe(400);
  });

  it('รายชื่อบอกว่าใคร login แล้ว ใครลงทะเบียนหน้าแล้ว เรียงตามรหัส', async () => {
    const { owner, course, repo, service } = setup();
    await service.add(owner, course.id, { codes: '66112126 66112106 66112199' });
    repo.accounts = [
      { studentCode: '66112106', userId: 'u1', fullName: 'เบนซ์', identityVerified: true },
      { studentCode: '66112126', userId: 'u2', fullName: 'ฟิล์ม', identityVerified: true },
    ];
    repo.faceUserIds.add('u1');

    expect(await service.list(owner, course.id)).toEqual([
      { studentCode: '66112106', fullName: 'เบนซ์', hasLoggedIn: true, faceEnrolled: true },
      { studentCode: '66112126', fullName: 'ฟิล์ม', hasLoggedIn: true, faceEnrolled: false },
      { studentCode: '66112199', fullName: null, hasLoggedIn: false, faceEnrolled: false },
    ]);
  });

  it('เอาออกได้ และรหัสที่ไม่มีในวิชาได้ 404 STUDENT_NOT_IN_COURSE', async () => {
    const { owner, course, service } = setup();
    await service.add(owner, course.id, { codes: '66112106' });
    await service.remove(owner, course.id, '66112106');
    expect(await service.list(owner, course.id)).toEqual([]);
    expect(await rejection(service.remove(owner, course.id, '66112106'))).toMatchObject({
      status: 404,
      code: 'STUDENT_NOT_IN_COURSE',
    });
  });

  it('วิชาของคนอื่นได้ 404 COURSE_NOT_FOUND ทุก route', async () => {
    const { course, service } = setup();
    const other = user();
    const notFound = { status: 404, code: 'COURSE_NOT_FOUND' };
    expect(await rejection(service.list(other, course.id))).toMatchObject(notFound);
    expect(await rejection(service.add(other, course.id, { codes: '1' }))).toMatchObject(notFound);
    expect(await rejection(service.remove(other, course.id, '1'))).toMatchObject(notFound);
  });

  it('entries คืนรายชื่อพร้อม userId (คนที่ยังไม่ login ได้ null) ไม่ตรวจสิทธิ์', async () => {
    const { owner, course, repo, service } = setup();
    await service.add(owner, course.id, { codes: '66112106 66112199' });
    repo.accounts = [
      { studentCode: '66112106', userId: 'u1', fullName: 'เบนซ์', identityVerified: true },
    ];
    expect(await service.entries(course.id)).toEqual([
      {
        studentCode: '66112106',
        userId: 'u1',
        fullName: 'เบนซ์',
        hasLoggedIn: true,
        faceEnrolled: false,
      },
      {
        studentCode: '66112199',
        userId: null,
        fullName: null,
        hasLoggedIn: false,
        faceEnrolled: false,
      },
    ]);
  });

  it('ครบทุกท่าแต่ยังไม่ยืนยันบัตร ไม่นับว่าลงทะเบียนหน้า และกล้องไม่เทียบ', async () => {
    const { owner, course, repo, service } = setup();
    await service.add(owner, course.id, { codes: '66112106' });
    repo.accounts = [
      { studentCode: '66112106', userId: 'u1', fullName: null, identityVerified: false },
    ];
    repo.faceUserIds.add('u1');
    expect((await service.entries(course.id))[0].faceEnrolled).toBe(false);
    expect(await service.enrolledUserIds(course.id)).toEqual([]);
  });

  it('enrolledUserIds คืนเฉพาะคนที่ login และยืนยันบัตรแล้ว (แผน 5 ใช้เลือกคนไปเทียบหน้า)', async () => {
    const { owner, course, repo, service } = setup();
    await service.add(owner, course.id, { codes: '66112106 66112199' });
    repo.accounts = [
      { studentCode: '66112106', userId: 'u1', fullName: null, identityVerified: true },
    ];
    expect(await service.enrolledUserIds(course.id)).toEqual(['u1']);
  });
});
