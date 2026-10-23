import { randomUUID } from 'node:crypto';
import type { AppUser } from '../users/users.service.js';
import type { Course, CoursesRepo, NewCourse, Rules } from './courses.repo.js';
import { CoursesService, DEFAULT_RULES } from './courses.service.js';

// ตาราง courses + attendance_rules ปลอมในหน่วยความจำ
class InMemoryCoursesRepo implements CoursesRepo {
  courses = new Map<string, Course>();
  rules = new Map<string, Rules>();
  findCalls = 0;

  async listAll() {
    return [...this.courses.values()];
  }
  async listByTeacher(teacherId: string) {
    return [...this.courses.values()].filter((c) => c.teacherId === teacherId);
  }
  async findById(id: string) {
    this.findCalls++;
    return this.courses.get(id) ?? null;
  }
  async insert(course: NewCourse) {
    const row = { id: randomUUID(), ...course };
    this.courses.set(row.id, row);
    return row;
  }
  async update(id: string, patch: Partial<NewCourse>) {
    const row = { ...this.courses.get(id)!, ...patch };
    this.courses.set(id, row);
    return row;
  }
  async getRules(courseId: string) {
    return this.rules.get(courseId) ?? null;
  }
  async saveRules(courseId: string, rules: Rules) {
    this.rules.set(courseId, rules);
    return rules;
  }
}

const user = (id: string, role: AppUser['role'] = 'teacher'): AppUser => ({
  id,
  email: `${id}@dpu.ac.th`,
  fullName: null,
  role,
  studentId: null,
  pdpaConsentAt: null,
  identityVerifiedAt: null,
});

const teacherA = user(randomUUID());
const teacherB = user(randomUUID());
const admin = user(randomUUID(), 'admin');

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
  const repo = new InMemoryCoursesRepo();
  return { repo, service: new CoursesService(repo) };
}

describe('CoursesService', () => {
  it('อาจารย์เห็นแค่วิชาตัวเอง แอดมินเห็นทุกวิชา', async () => {
    const { service } = setup();
    await service.create(teacherA, { code: 'cs101', name: 'โปรแกรมมิ่ง' });
    await service.create(teacherB, { code: 'cs102', name: 'ฐานข้อมูล' });

    expect((await service.listFor(teacherA)).map((c) => c.code)).toEqual(['CS101']);
    expect(await service.listFor(admin)).toHaveLength(2);
  });

  it('สร้างวิชาแล้วตัดช่องว่าง รหัสเป็นตัวใหญ่ กลุ่มว่างเป็น null', async () => {
    const { service } = setup();
    const course = await service.create(teacherA, {
      code: ' cs101 ',
      name: ' โปรแกรมมิ่ง ',
      section: ' ',
    });
    expect(course).toMatchObject({
      code: 'CS101',
      name: 'โปรแกรมมิ่ง',
      section: null,
      teacherId: teacherA.id,
    });
  });

  it('สร้างวิชาแล้วได้เกณฑ์ค่าเริ่มต้น 15 / null / 15', async () => {
    const { service } = setup();
    const course = await service.create(teacherA, { code: 'CS101', name: 'x' });
    expect(DEFAULT_RULES).toEqual({ lateAfterMin: 15, absentAfterMin: null, outOfRoomLimitMin: 15 });
    expect(await service.getRules(teacherA, course.id)).toEqual(DEFAULT_RULES);
  });

  it.each([
    [{ code: '', name: 'x' }],
    [{ code: 'CS101', name: '' }],
    [{ code: 'CS101', name: 'ก'.repeat(201) }],
    [{ code: 'C'.repeat(31), name: 'x' }],
    [{ name: 'x' }],
  ])('ข้อมูลวิชาไม่ถูกต้องได้ 400 %j', async (body) => {
    const { service } = setup();
    expect((await rejection(service.create(teacherA, body))).status).toBe(400);
  });

  it('วิชาของอาจารย์คนอื่นได้ 404 COURSE_NOT_FOUND ทุกทาง', async () => {
    const { service } = setup();
    const course = await service.create(teacherB, { code: 'CS102', name: 'x' });
    const notFound = { status: 404, code: 'COURSE_NOT_FOUND' };

    expect(await rejection(service.getOwned(teacherA, course.id))).toMatchObject(notFound);
    expect(await rejection(service.update(teacherA, course.id, { name: 'y' }))).toMatchObject(
      notFound,
    );
    expect(await rejection(service.getRules(teacherA, course.id))).toMatchObject(notFound);
    expect(
      await rejection(
        service.setRules(teacherA, course.id, {
          lateAfterMin: 10,
          absentAfterMin: null,
          outOfRoomLimitMin: 10,
        }),
      ),
    ).toMatchObject(notFound);
  });

  it('แอดมินเข้าวิชาของใครก็ได้', async () => {
    const { service } = setup();
    const course = await service.create(teacherB, { code: 'CS102', name: 'x' });
    expect((await service.getOwned(admin, course.id)).id).toBe(course.id);
  });

  it('id ที่ไม่ใช่ uuid ได้ 404 โดยไม่ถามฐานข้อมูล', async () => {
    const { repo, service } = setup();
    expect(await rejection(service.getOwned(teacherA, 'abc'))).toMatchObject({
      status: 404,
      code: 'COURSE_NOT_FOUND',
    });
    expect(repo.findCalls).toBe(0);
  });

  it('แก้ชื่อวิชาได้ และแก้ teacherId ผ่าน body ไม่ได้', async () => {
    const { service } = setup();
    const course = await service.create(teacherA, { code: 'CS101', name: 'x' });
    const updated = await service.update(teacherA, course.id, {
      name: 'ใหม่',
      teacherId: teacherB.id,
    });
    expect(updated).toMatchObject({ name: 'ใหม่', teacherId: teacherA.id });
  });

  it('ตั้งเกณฑ์ได้ และ absentAfterMin เป็น null ได้', async () => {
    const { service } = setup();
    const course = await service.create(teacherA, { code: 'CS101', name: 'x' });
    const rules = { lateAfterMin: 10, absentAfterMin: 30, outOfRoomLimitMin: 20 };
    expect(await service.setRules(teacherA, course.id, rules)).toEqual(rules);
    expect(await service.getRules(teacherA, course.id)).toEqual(rules);
  });

  it('เวลาตัดขาดต้องมากกว่าเวลาตัดสาย', async () => {
    const { service } = setup();
    const course = await service.create(teacherA, { code: 'CS101', name: 'x' });
    expect(
      await rejection(
        service.setRules(teacherA, course.id, {
          lateAfterMin: 15,
          absentAfterMin: 15,
          outOfRoomLimitMin: 15,
        }),
      ),
    ).toEqual({ status: 400, code: 'BAD_REQUEST', message: 'เวลาตัดขาดต้องมากกว่าเวลาตัดสาย' });
  });

  it.each([
    [{ lateAfterMin: -1, absentAfterMin: null, outOfRoomLimitMin: 15 }],
    [{ lateAfterMin: 241, absentAfterMin: null, outOfRoomLimitMin: 15 }],
    [{ lateAfterMin: 15, absentAfterMin: null, outOfRoomLimitMin: 0 }],
    [{ lateAfterMin: 1.5, absentAfterMin: null, outOfRoomLimitMin: 15 }],
    [{ lateAfterMin: 15, outOfRoomLimitMin: 15 }],
  ])('เกณฑ์นอกช่วงได้ 400 %j', async (rules) => {
    const { service } = setup();
    const course = await service.create(teacherA, { code: 'CS101', name: 'x' });
    expect((await rejection(service.setRules(teacherA, course.id, rules))).status).toBe(400);
  });

  it('วิชาที่ยังไม่มีแถวเกณฑ์ ได้ค่าเริ่มต้น', async () => {
    const { repo, service } = setup();
    const course = await service.create(teacherA, { code: 'CS101', name: 'x' });
    repo.rules.clear();
    expect(await service.getRules(teacherA, course.id)).toEqual(DEFAULT_RULES);
  });
});
