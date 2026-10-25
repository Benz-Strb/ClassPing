import { randomUUID } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import type { AppConfig } from '../config/config.js';
import type { Course, CoursesRepo } from '../courses/courses.repo.js';
import { CoursesService } from '../courses/courses.service.js';
import type { RoomsRepo } from '../rooms/rooms.repo.js';
import type { ExamSlot, Override, Schedule, SchedulesRepo } from '../schedules/schedules.repo.js';
import type { AppUser } from '../users/users.service.js';
import type { ExamRow, ExamsRepo, NewExam, Person } from './exams.repo.js';
import { ExamsService } from './exams.service.js';

// อังคาร 20 ต.ค. 2569 10:00 เวลาไทย
const NOW = new Date('2026-10-20T03:00:00Z');
const TODAY = '2026-10-20';
const NEXT_MONDAY = '2026-10-26';

const user = (role: AppUser['role'] = 'teacher', fullName: string | null = null): AppUser => ({
  id: randomUUID(),
  email: `${randomUUID().slice(0, 6)}@dpu.ac.th`,
  fullName,
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

function setup(openBeforeMin = 20) {
  const owner = user();
  const other = user();
  const proctor = user('teacher', 'อ.คุมสอบ');
  const student = user('student');
  const people = new Map([owner, other, proctor, student].map((u) => [u.id, u]));
  const course = (teacherId: string, code: string): Course => ({
    id: randomUUID(),
    code,
    name: code,
    section: null,
    teacherId,
  });
  const cs101 = course(owner.id, 'CS101');
  const cs102 = course(other.id, 'CS102');
  const courseRows = new Map([cs101, cs102].map((c) => [c.id, c]));
  const roomA = randomUUID();
  const roomB = randomUUID();
  const roomNames = new Map<string, string>([
    [roomA, 'ห้อง A'],
    [roomB, 'ห้อง B'],
  ]);

  const exams = new Map<string, ExamRow>();
  const failInsert = { on: false };
  const toPerson = (id: string): Person => ({
    id,
    name: people.get(id)!.fullName,
    email: people.get(id)!.email,
  });
  const examsRepo: ExamsRepo = {
    listByCourse: async (courseId) =>
      [...exams.values()]
        .filter((e) => e.courseId === courseId)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    findById: async (id) => exams.get(id) ?? null,
    insert: async (exam: NewExam, proctorIds) => {
      if (failInsert.on) throw new Error('db down');
      const id = randomUUID();
      exams.set(id, {
        ...exam,
        id,
        roomName: roomNames.get(exam.roomId)!,
        proctors: proctorIds.map(toPerson),
      });
      return id;
    },
    update: async (id, patch) => {
      const row = exams.get(id)!;
      exams.set(id, { ...row, ...patch, roomName: roomNames.get(patch.roomId)! });
    },
    setProctors: async (id, ids) => {
      exams.get(id)!.proctors = ids.map(toPerson);
    },
    remove: async (id) => void exams.delete(id),
    findUsers: async (ids) =>
      ids.filter((id) => people.has(id)).map((id) => ({ id, role: people.get(id)!.role })),
    listTeachers: async () => [],
  };

  const schedules: Schedule[] = [];
  const overrides: Override[] = [];
  // แถวคาบเรียนจริงใน sessions (ปกติตรงกับตาราง แต่อาจเหลือแถวที่ไม่มีตารางแล้ว)
  const classRows: ExamSlot[] = [];
  const schedulesRepo = {
    listClassSessionsOn: async (date: string) => classRows.filter((r) => r.onDate === date),
    listByWeekday: async (weekday: number) => schedules.filter((s) => s.weekday === weekday),
    listOverridesOnDate: async (date: string) => overrides.filter((o) => o.onDate === date),
    listExamsBetween: async (from: string, to: string) =>
      [...exams.values()]
        .filter((e) => e.onDate >= from && e.onDate <= to)
        .map((e) => ({ ...e, courseCode: courseRows.get(e.courseId)!.code })),
  } as unknown as SchedulesRepo;

  const config = { cameraOpenBeforeMin: openBeforeMin } as AppConfig;
  const sessionCalls: string[] = [];
  const sessions = {
    opened: false,
    clearClassesFor: async (
      courseId: string,
      slot: { onDate: string },
      save: () => Promise<void>,
    ) => {
      if (sessions.opened)
        throw new AppError(400, 'SESSION_STARTED', 'คาบเรียนที่ทับเริ่มเช็คชื่อแล้ว');
      sessionCalls.push(`clear ${courseId === cs101.id ? 'CS101' : 'CS102'} ${slot.onDate}`);
      await save();
    },
    syncCourse: async (courseId: string) =>
      void sessionCalls.push(`sync ${courseId === cs101.id ? 'CS101' : 'CS102'}`),
  };
  const service = new ExamsService(
    new CoursesService({
      findById: async (id: string) => courseRows.get(id) ?? null,
    } as unknown as CoursesRepo),
    {
      findById: async (id: string) => (roomNames.has(id) ? { id, name: roomNames.get(id)! } : null),
    } as unknown as RoomsRepo,
    schedulesRepo,
    examsRepo,
    sessions,
    () => NOW,
    config,
  );

  const addSchedule = (patch: Partial<Schedule>) => {
    const schedule: Schedule = {
      id: randomUUID(),
      courseId: cs102.id,
      weekday: 1,
      startTime: '09:00',
      endTime: '12:00',
      roomId: roomA,
      courseCode: 'CS102',
      roomName: 'ห้อง A',
      ...patch,
    };
    schedules.push(schedule);
    return schedule;
  };

  const body = (patch: Record<string, unknown> = {}) => ({
    title: 'สอบกลางภาค',
    date: NEXT_MONDAY,
    start: '10:00',
    end: '12:00',
    roomId: roomB,
    lateAfterMin: 10,
    absentAfterMin: 30,
    proctorIds: [proctor.id],
    ...patch,
  });

  return {
    owner,
    other,
    proctor,
    student,
    cs101,
    cs102,
    roomA,
    roomB,
    service,
    config,
    sessions,
    sessionCalls,
    failInsert,
    overrides,
    addSchedule,
    classRows,
    body,
  };
}

// แถวคาบเรียนที่ตารางถูกลบไปแล้วแต่ยังอยู่ (กล้องเปิดไปแล้วเลยไม่ถูกลบ)
const orphan = (courseId: string, courseCode: string, roomId: string): ExamSlot => ({
  id: randomUUID(),
  courseId,
  courseCode,
  roomId,
  roomName: '',
  onDate: NEXT_MONDAY,
  startsAt: new Date(`${NEXT_MONDAY}T02:30:00Z`),
  endsAt: new Date(`${NEXT_MONDAY}T03:30:00Z`),
});

describe('ExamsService สร้างและดูคาบสอบ', () => {
  it('สร้างแล้วได้ห้อง คนคุมสอบ และเวลาไทยกลับมา', async () => {
    const { owner, proctor, cs101, roomB, service, body } = setup();
    const exam = await service.create(owner, cs101.id, body());
    expect(exam).toMatchObject({
      title: 'สอบกลางภาค',
      onDate: NEXT_MONDAY,
      start: '10:00',
      end: '12:00',
      startsAt: '2026-10-26T03:00:00.000Z',
      room: { id: roomB, name: 'ห้อง B' },
      lateAfterMin: 10,
      absentAfterMin: 30,
      proctors: [{ id: proctor.id, name: 'อ.คุมสอบ' }],
      locked: false,
    });
    expect((await service.list(owner, cs101.id)).map((e) => e.id)).toEqual([exam.id]);
  });

  it('อาจารย์วิชาอื่นได้ 404 แอดมินสร้างให้วิชาไหนก็ได้', async () => {
    const { other, cs101, service, body } = setup();
    expect((await rejection(service.create(other, cs101.id, body()))).code).toBe(
      'COURSE_NOT_FOUND',
    );
    await expect(service.create(user('admin'), cs101.id, body())).resolves.toBeTruthy();
  });

  it('ข้อมูลไม่ถูกต้องได้ 400', async () => {
    const { owner, cs101, service, body } = setup();
    const code = async (patch: Record<string, unknown>) =>
      (await rejection(service.create(owner, cs101.id, body(patch)))).code;
    expect(await code({ date: '2026-10-19' })).toBe('DATE_IN_PAST');
    expect(await code({ start: '06:00' })).toBe('BAD_REQUEST');
    expect(await code({ lateAfterMin: -1 })).toBe('BAD_REQUEST');
    expect(await code({ absentAfterMin: 10 })).toBe('BAD_REQUEST');
    expect(await code({ title: '  ' })).toBe('BAD_REQUEST');
    expect(await code({ date: '26-10-2026' })).toBe('BAD_REQUEST');
  });

  it('ไม่ตั้งเวลาตัดขาด = นับขาดตอนหมดคาบ', async () => {
    const { owner, cs101, service, body } = setup();
    const exam = await service.create(owner, cs101.id, body({ absentAfterMin: null }));
    expect(exam.absentAfterMin).toBeNull();
  });

  it('คนคุมสอบที่ไม่ใช่อาจารย์ หรือไม่มีบัญชี ได้ 400 NOT_A_TEACHER', async () => {
    const { owner, student, cs101, service, body } = setup();
    for (const id of [student.id, randomUUID()]) {
      expect(
        (await rejection(service.create(owner, cs101.id, body({ proctorIds: [id] })))).code,
      ).toBe('NOT_A_TEACHER');
    }
  });
});

describe('ExamsService ห้องและเวลาชน', () => {
  it('ทับห้องของตารางเรียนวันนั้น ได้ ROOM_CONFLICT', async () => {
    const { owner, cs101, roomA, service, addSchedule, body } = setup();
    addSchedule({});
    expect(await rejection(service.create(owner, cs101.id, body({ roomId: roomA })))).toEqual({
      status: 409,
      code: 'ROOM_CONFLICT',
      message: 'ห้อง A มีวิชา CS102 เวลา 09:00-12:00 แล้ว',
    });
  });

  it('ตารางเรียนที่งดสอนวันนั้น ไม่นับว่าชน', async () => {
    const { owner, cs101, roomA, service, overrides, addSchedule, body } = setup();
    const schedule = addSchedule({});
    overrides.push({
      scheduleId: schedule.id,
      onDate: NEXT_MONDAY,
      cancelled: true,
      roomId: null,
      startTime: null,
      endTime: null,
    });
    await expect(service.create(owner, cs101.id, body({ roomId: roomA }))).resolves.toBeTruthy();
  });

  it('ทับห้องของคาบเรียนที่ไม่มีตารางแล้วแต่ยังอยู่ ได้ ROOM_CONFLICT', async () => {
    const { owner, cs101, cs102, roomA, service, classRows, body } = setup();
    classRows.push(orphan(cs102.id, 'CS102', roomA));
    expect(await rejection(service.create(owner, cs101.id, body({ roomId: roomA })))).toEqual({
      status: 409,
      code: 'ROOM_CONFLICT',
      message: 'ห้อง A มีวิชา CS102 เวลา 09:30-10:30 แล้ว',
    });
  });

  it('คาบเรียนของวิชาตัวเองที่ไม่มีตารางแล้ว ก็ต้องยืนยันก่อนแทน', async () => {
    const { owner, cs101, roomA, service, classRows, body } = setup();
    classRows.push(orphan(cs101.id, 'CS101', roomA));
    expect(await rejection(service.create(owner, cs101.id, body()))).toEqual({
      status: 409,
      code: 'REPLACES_CLASS',
      message: 'คาบสอบนี้ทับคาบเรียน 09:30-10:30 ของวันนั้น คาบเรียนจะถูกแทนด้วยคาบสอบ',
    });
  });

  it('แถวคาบเรียนที่ตรงกับตาราง ไม่บอกเวลาซ้ำ', async () => {
    const { owner, cs101, roomA, service, addSchedule, classRows, body } = setup();
    addSchedule({ courseId: cs101.id, courseCode: 'CS101', roomId: roomA, endTime: '10:30' });
    classRows.push({
      ...orphan(cs101.id, 'CS101', roomA),
      startsAt: new Date(`${NEXT_MONDAY}T02:00:00Z`),
    });
    expect((await rejection(service.create(owner, cs101.id, body()))).message).toBe(
      'คาบสอบนี้ทับคาบเรียน 09:00-10:30 ของวันนั้น คาบเรียนจะถูกแทนด้วยคาบสอบ',
    );
  });

  it('ทับคาบเรียนของวิชาตัวเอง ต้องยืนยันก่อน (409 REPLACES_CLASS) ทั้งห้องเดิมและคนละห้อง', async () => {
    const { owner, cs101, roomA, service, addSchedule, body, sessionCalls } = setup();
    addSchedule({ courseId: cs101.id, courseCode: 'CS101', roomId: roomA, endTime: '10:30' });
    for (const roomId of [roomA, undefined]) {
      const patch = roomId ? { roomId } : {};
      expect(await rejection(service.create(owner, cs101.id, body(patch)))).toEqual({
        status: 409,
        code: 'REPLACES_CLASS',
        message: 'คาบสอบนี้ทับคาบเรียน 09:00-10:30 ของวันนั้น คาบเรียนจะถูกแทนด้วยคาบสอบ',
      });
    }
    expect(sessionCalls).toEqual([]);
  });

  it('ยืนยันแล้ว เอาคาบเรียนที่ทับออกก่อนบันทึก แล้วสร้างคาบใหม่ของวิชา', async () => {
    const { owner, cs101, roomA, service, addSchedule, body, sessionCalls } = setup();
    addSchedule({ courseId: cs101.id, courseCode: 'CS101', roomId: roomA });
    const exam = await service.create(
      owner,
      cs101.id,
      body({ roomId: roomA, replaceClasses: true }),
    );
    expect(exam.room.id).toBe(roomA);
    expect(sessionCalls).toEqual([`clear CS101 ${NEXT_MONDAY}`, 'sync CS101']);
  });

  it('บันทึกคาบสอบไม่สำเร็จหลังเอาคาบเรียนออก ยังสร้างคาบของวิชาใหม่ (คาบเรียนกลับมา)', async () => {
    const { owner, cs101, roomA, service, addSchedule, body, sessionCalls, failInsert } = setup();
    addSchedule({ courseId: cs101.id, courseCode: 'CS101', roomId: roomA });
    failInsert.on = true;
    await expect(
      service.create(owner, cs101.id, body({ roomId: roomA, replaceClasses: true })),
    ).rejects.toThrow('db down');
    expect(sessionCalls).toEqual([`clear CS101 ${NEXT_MONDAY}`, 'sync CS101']);
  });

  it('คนคุมสอบซ้ำในรายการ บันทึกครั้งเดียว ทั้งตอนสร้างและแก้', async () => {
    const { owner, proctor, cs101, service, body } = setup();
    const twice = [proctor.id, proctor.id];
    const exam = await service.create(owner, cs101.id, body({ proctorIds: twice }));
    expect(exam.proctors.map((p) => p.id)).toEqual([proctor.id]);
    const updated = await service.update(owner, exam.id, body({ end: '12:30', proctorIds: twice }));
    expect(updated.proctors.map((p) => p.id)).toEqual([proctor.id]);
  });

  it('คาบเรียนที่ทับเริ่มเช็คชื่อแล้ว สร้างไม่ได้', async () => {
    const { owner, cs101, service, addSchedule, body, sessions } = setup();
    addSchedule({ courseId: cs101.id, courseCode: 'CS101' });
    sessions.opened = true;
    expect(
      (await rejection(service.create(owner, cs101.id, body({ replaceClasses: true })))).code,
    ).toBe('SESSION_STARTED');
  });

  it('ไม่ทับคาบเรียน ไม่ต้องยืนยัน และหลังแก้/ลบ สร้างคาบของวิชาใหม่ (คาบเรียนกลับมา)', async () => {
    const { owner, cs101, service, body, sessionCalls } = setup();
    const exam = await service.create(owner, cs101.id, body());
    await service.update(owner, exam.id, body({ end: '12:30' }));
    await service.remove(owner, exam.id);
    expect(sessionCalls.filter((c) => c.startsWith('sync'))).toEqual([
      'sync CS101',
      'sync CS101',
      'sync CS101',
    ]);
  });

  it('คาบสอบของวิชาเดียวกันทับกันเอง ได้ TIME_CONFLICT', async () => {
    const { owner, cs101, roomA, service, body } = setup();
    await service.create(owner, cs101.id, body());
    expect(
      (await rejection(service.create(owner, cs101.id, body({ roomId: roomA, title: 'สอบย่อย' }))))
        .code,
    ).toBe('TIME_CONFLICT');
  });

  it('ทับห้องของคาบสอบอื่น ได้ ROOM_CONFLICT แต่แก้คาบสอบตัวเองไม่นับว่าชนกับตัวเอง', async () => {
    const { owner, other, cs101, cs102, service, body } = setup();
    const mine = await service.create(owner, cs101.id, body());
    expect((await rejection(service.create(other, cs102.id, body({ proctorIds: [] })))).code).toBe(
      'ROOM_CONFLICT',
    );
    await expect(service.update(owner, mine.id, body({ end: '12:30' }))).resolves.toMatchObject({
      end: '12:30',
    });
  });
});

describe('ExamsService หลังกล้องเปิด', () => {
  // กล้องเปิดก่อน 20 นาที คาบ 10:15 วันนี้ เปิดไปแล้วตอน 09:55
  it('แก้รายละเอียดหรือลบไม่ได้ แต่เปลี่ยนคนคุมสอบได้', async () => {
    const { owner, cs101, service, config, body } = setup(0);
    const today = (patch: Record<string, unknown> = {}) =>
      body({ date: TODAY, start: '10:15', ...patch });
    const exam = await service.create(owner, cs101.id, today());
    config.cameraOpenBeforeMin = 20;

    expect(
      (await rejection(service.update(owner, exam.id, today({ title: 'สอบย่อย' })))).code,
    ).toBe('SESSION_STARTED');
    expect((await rejection(service.remove(owner, exam.id))).code).toBe('SESSION_STARTED');
    const updated = await service.update(owner, exam.id, today({ proctorIds: [] }));
    expect(updated.proctors).toEqual([]);
    expect(updated.locked).toBe(true);
  });

  it('สร้างคาบสอบที่กล้องควรเปิดไปแล้วไม่ได้', async () => {
    const { owner, cs101, service, body } = setup(20);
    expect(
      (await rejection(service.create(owner, cs101.id, body({ date: TODAY, start: '10:10' }))))
        .code,
    ).toBe('SESSION_STARTED');
  });

  it('ลบคาบสอบที่ยังไม่เริ่มได้', async () => {
    const { owner, cs101, service, body } = setup();
    const exam = await service.create(owner, cs101.id, body());
    await service.remove(owner, exam.id);
    expect(await service.list(owner, cs101.id)).toEqual([]);
  });
});
