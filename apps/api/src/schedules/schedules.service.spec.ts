import { randomUUID } from 'node:crypto';
import type { Course, CoursesRepo } from '../courses/courses.repo.js';
import { CoursesService } from '../courses/courses.service.js';
import type { RoomsRepo } from '../rooms/rooms.repo.js';
import type { AppUser } from '../users/users.service.js';
import type { NewSchedule, Override, Schedule, SchedulesRepo } from './schedules.repo.js';
import { SchedulesService, type SessionSyncer } from './schedules.service.js';

// อังคาร 20 ต.ค. 2569 10:00 เวลาไทย
const NOW = new Date('2026-10-20T03:00:00Z');
const NEXT_MONDAY = '2026-10-26';
const LAST_MONDAY = '2026-10-19';

class InMemorySchedulesRepo implements SchedulesRepo {
  schedules = new Map<string, NewSchedule & { id: string }>();
  overrides: Override[] = [];

  constructor(
    private readonly courseCodes: Map<string, string>,
    private readonly roomNames: Map<string, string>,
  ) {}

  private view(row: NewSchedule & { id: string }): Schedule {
    return {
      ...row,
      courseCode: this.courseCodes.get(row.courseId) ?? '?',
      roomName: this.roomNames.get(row.roomId) ?? '?',
    };
  }
  async listAll() {
    return [...this.schedules.values()].map((s) => this.view(s));
  }
  async listByCourse(courseId: string) {
    return [...this.schedules.values()].filter((s) => s.courseId === courseId).map((s) => this.view(s));
  }
  async findById(id: string) {
    const row = this.schedules.get(id);
    return row ? this.view(row) : null;
  }
  async listByWeekday(weekday: number) {
    return [...this.schedules.values()].filter((s) => s.weekday === weekday).map((s) => this.view(s));
  }
  async insert(schedule: NewSchedule) {
    const row = { id: randomUUID(), ...schedule };
    this.schedules.set(row.id, row);
    return this.view(row);
  }
  async update(id: string, patch: Partial<NewSchedule>) {
    const row = { ...this.schedules.get(id)!, ...patch };
    this.schedules.set(id, row);
    return this.view(row);
  }
  async remove(id: string) {
    this.schedules.delete(id);
  }
  async listOverrides(scheduleIds: string[], from: string, to: string) {
    return this.overrides.filter(
      (o) => scheduleIds.includes(o.scheduleId) && o.onDate >= from && o.onDate <= to,
    );
  }
  async listOverridesOnDate(date: string) {
    return this.overrides.filter((o) => o.onDate === date);
  }
  async saveOverride(override: Override) {
    this.overrides = this.overrides.filter(
      (o) => !(o.scheduleId === override.scheduleId && o.onDate === override.onDate),
    );
    this.overrides.push(override);
    return override;
  }
  async removeOverride(scheduleId: string, date: string) {
    const before = this.overrides.length;
    this.overrides = this.overrides.filter(
      (o) => !(o.scheduleId === scheduleId && o.onDate === date),
    );
    return this.overrides.length < before;
  }
}

const user = (role: AppUser['role'] = 'teacher'): AppUser => ({
  id: randomUUID(),
  email: 'x@dpu.ac.th',
  fullName: null,
  role,
  studentId: null,
  pdpaConsentAt: null,
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
  const otherTeacher = user();
  const course = (teacherId: string, code: string): Course => ({
    id: randomUUID(),
    code,
    name: code,
    section: null,
    teacherId,
  });
  const cs101 = course(owner.id, 'CS101');
  const cs102 = course(otherTeacher.id, 'CS102');
  const courseRows = new Map([cs101, cs102].map((c) => [c.id, c]));
  const roomA = randomUUID();
  const roomB = randomUUID();
  const roomNames = new Map([
    [roomA, 'ห้อง A'],
    [roomB, 'ห้อง B'],
  ]);

  const courses = new CoursesService({
    findById: async (id: string) => courseRows.get(id) ?? null,
  } as unknown as CoursesRepo);
  const rooms = {
    findById: async (id: string) =>
      roomNames.has(id) ? { id, name: roomNames.get(id)! } : null,
  } as unknown as RoomsRepo;
  const repo = new InMemorySchedulesRepo(
    new Map([...courseRows.values()].map((c) => [c.id, c.code])),
    roomNames,
  );
  const synced: string[] = [];
  const syncer: SessionSyncer = { syncCourse: async (id) => void synced.push(id) };
  const service = new SchedulesService(courses, rooms, repo, syncer, () => NOW);

  const monday = (overrides: Record<string, unknown> = {}) => ({
    weekday: 1,
    startTime: '09:00',
    endTime: '12:00',
    roomId: roomA,
    ...overrides,
  });

  return { owner, otherTeacher, cs101, cs102, roomA, roomB, repo, synced, service, monday };
}

describe('SchedulesService ตารางประจำ', () => {
  it('สร้างแล้วได้ชื่อห้องกลับมา และเรียก syncCourse', async () => {
    const { owner, cs101, synced, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    expect(schedule).toMatchObject({
      courseId: cs101.id,
      weekday: 1,
      startTime: '09:00',
      endTime: '12:00',
      roomName: 'ห้อง A',
    });
    expect(synced).toEqual([cs101.id]);
    expect(await service.list(owner, cs101.id)).toHaveLength(1);
  });

  it.each([
    [{ startTime: '12:00', endTime: '09:00' }],
    [{ startTime: '09:00', endTime: '09:10' }],
    [{ startTime: '08:00', endTime: '14:30' }],
    [{ startTime: '06:30', endTime: '08:00' }],
    [{ startTime: '21:00', endTime: '22:30' }],
    [{ startTime: '9:00', endTime: '12:00' }],
    [{ startTime: '09:00', endTime: '24:00' }],
    [{ weekday: 7 }],
    [{ weekday: 1.5 }],
  ])('เวลา/วันไม่ถูกต้องได้ 400 %j', async (patch) => {
    const { owner, cs101, service, monday } = setup();
    expect(await rejection(service.create(owner, cs101.id, monday(patch)))).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('ห้องที่ไม่มีอยู่ได้ 400 ROOM_NOT_FOUND', async () => {
    const { owner, cs101, service, monday } = setup();
    expect(
      await rejection(service.create(owner, cs101.id, monday({ roomId: randomUUID() }))),
    ).toMatchObject({ status: 400, code: 'ROOM_NOT_FOUND' });
  });

  it('ห้องเดียวกัน วันเดียวกัน เวลาซ้อน ได้ 409 ROOM_CONFLICT บอกวิชาที่ชน', async () => {
    const { owner, otherTeacher, cs101, cs102, service, monday } = setup();
    await service.create(owner, cs101.id, monday());

    const conflict = await rejection(
      service.create(otherTeacher, cs102.id, monday({ startTime: '11:00', endTime: '13:00' })),
    );
    expect(conflict).toMatchObject({ status: 409, code: 'ROOM_CONFLICT' });
    expect(conflict.message).toContain('CS101');
    expect(conflict.message).toContain('09:00–12:00');
  });

  it('ต่อกันพอดีขอบ / คนละวัน / คนละห้อง ไม่ชน', async () => {
    const { owner, otherTeacher, cs101, cs102, roomB, service, monday } = setup();
    await service.create(owner, cs101.id, monday());
    await service.create(otherTeacher, cs102.id, monday({ startTime: '12:00', endTime: '15:00' }));
    await service.create(otherTeacher, cs102.id, monday({ weekday: 2 }));
    await service.create(otherTeacher, cs102.id, monday({ roomId: roomB }));
  });

  it('แก้เวลาตารางเดิมไม่ชนกับตัวเอง แต่ชนกับคนอื่นได้ 409', async () => {
    const { owner, otherTeacher, cs101, cs102, service, monday } = setup();
    const mine = await service.create(owner, cs101.id, monday());
    await service.create(otherTeacher, cs102.id, monday({ startTime: '13:00', endTime: '15:00' }));

    expect((await service.update(owner, mine.id, { endTime: '12:30' })).endTime).toBe('12:30');
    expect(await rejection(service.update(owner, mine.id, { endTime: '14:00' }))).toMatchObject({
      status: 409,
      code: 'ROOM_CONFLICT',
    });
  });

  it('ลบตารางแล้วเรียก syncCourse', async () => {
    const { owner, cs101, synced, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    await service.remove(owner, schedule.id);
    expect(await service.list(owner, cs101.id)).toEqual([]);
    expect(synced).toEqual([cs101.id, cs101.id]);
  });

  it('ตารางของวิชาคนอื่นได้ 404 ทุก route', async () => {
    const { owner, otherTeacher, cs101, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    const notFound = { status: 404, code: 'SCHEDULE_NOT_FOUND' };

    expect(await rejection(service.list(otherTeacher, cs101.id))).toMatchObject({
      status: 404,
      code: 'COURSE_NOT_FOUND',
    });
    expect(await rejection(service.create(otherTeacher, cs101.id, monday()))).toMatchObject({
      status: 404,
    });
    expect(await rejection(service.update(otherTeacher, schedule.id, {}))).toMatchObject(notFound);
    expect(await rejection(service.remove(otherTeacher, schedule.id))).toMatchObject(notFound);
    expect(
      await rejection(service.setOverride(otherTeacher, schedule.id, NEXT_MONDAY, { cancelled: true })),
    ).toMatchObject(notFound);
    expect(await rejection(service.clearOverride(otherTeacher, schedule.id, NEXT_MONDAY))).toMatchObject(
      notFound,
    );
    expect(await rejection(service.update(owner, 'abc', {}))).toMatchObject(notFound);
  });
});

describe('SchedulesService เปลี่ยนเฉพาะวัน', () => {
  it('งดสอนไม่ต้องใส่เวลาหรือห้อง และเรียก syncCourse', async () => {
    const { owner, cs101, synced, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    const override = await service.setOverride(owner, schedule.id, NEXT_MONDAY, {
      cancelled: true,
      roomId: 'ไม่ใช้',
    });
    expect(override).toEqual({
      scheduleId: schedule.id,
      onDate: NEXT_MONDAY,
      cancelled: true,
      roomId: null,
      startTime: null,
      endTime: null,
    });
    expect(synced).toEqual([cs101.id, cs101.id]);
  });

  it('ย้ายห้องและเลื่อนเวลาได้ แล้วดูย้อนในช่วงวันที่ได้', async () => {
    const { owner, cs101, roomB, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    await service.setOverride(owner, schedule.id, NEXT_MONDAY, {
      roomId: roomB,
      startTime: '10:00',
    });
    expect(await service.listOverrides(owner, cs101.id, '2026-10-20', '2026-10-31')).toEqual([
      {
        scheduleId: schedule.id,
        onDate: NEXT_MONDAY,
        cancelled: false,
        roomId: roomB,
        startTime: '10:00',
        endTime: null,
      },
    ]);
  });

  it('วันที่ไม่ตรงวันของตารางได้ 400 WRONG_WEEKDAY', async () => {
    const { owner, cs101, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    expect(
      await rejection(service.setOverride(owner, schedule.id, '2026-10-27', { cancelled: true })),
    ).toMatchObject({ status: 400, code: 'WRONG_WEEKDAY' });
  });

  it('วันที่ผ่านไปแล้วได้ 400 DATE_IN_PAST', async () => {
    const { owner, cs101, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    expect(
      await rejection(service.setOverride(owner, schedule.id, LAST_MONDAY, { cancelled: true })),
    ).toMatchObject({ status: 400, code: 'DATE_IN_PAST' });
  });

  it.each(['2026-02-30', '26-10-26', 'พรุ่งนี้'])('วันที่ผิดรูปแบบได้ 400 %s', async (date) => {
    const { owner, cs101, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    expect(
      (await rejection(service.setOverride(owner, schedule.id, date, { cancelled: true }))).status,
    ).toBe(400);
  });

  it('ไม่งดและไม่เปลี่ยนอะไรเลยได้ 400 / เวลาหลังเปลี่ยนต้องถูกกฎ', async () => {
    const { owner, cs101, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    expect(
      (await rejection(service.setOverride(owner, schedule.id, NEXT_MONDAY, {}))).status,
    ).toBe(400);
    // เริ่ม 13:00 แต่จบตามเดิม 12:00 = เริ่มหลังจบ
    expect(
      (await rejection(service.setOverride(owner, schedule.id, NEXT_MONDAY, { startTime: '13:00' })))
        .status,
    ).toBe(400);
  });

  it('ย้ายไปห้องที่มีคาบอื่นทับเวลาในวันนั้นได้ 409 ROOM_CONFLICT', async () => {
    const { owner, otherTeacher, cs101, cs102, roomB, service, monday } = setup();
    const mine = await service.create(owner, cs101.id, monday());
    await service.create(otherTeacher, cs102.id, monday({ roomId: roomB, startTime: '10:00' }));

    const conflict = await rejection(
      service.setOverride(owner, mine.id, NEXT_MONDAY, { roomId: roomB }),
    );
    expect(conflict).toMatchObject({ status: 409, code: 'ROOM_CONFLICT' });
    expect(conflict.message).toContain('CS102');
  });

  it('ถ้าคาบในห้องนั้นงดในวันนั้นแล้ว ย้ายเข้าไปได้', async () => {
    const { owner, otherTeacher, cs101, cs102, roomB, service, monday } = setup();
    const mine = await service.create(owner, cs101.id, monday());
    const theirs = await service.create(otherTeacher, cs102.id, monday({ roomId: roomB }));
    await service.setOverride(otherTeacher, theirs.id, NEXT_MONDAY, { cancelled: true });

    await service.setOverride(owner, mine.id, NEXT_MONDAY, { roomId: roomB });
  });

  it('เลื่อนเวลาไปทับคาบที่ย้ายเข้ามาห้องเดียวกันในวันนั้นได้ 409', async () => {
    const { owner, otherTeacher, cs101, cs102, roomB, service, monday } = setup();
    const mine = await service.create(owner, cs101.id, monday());
    const theirs = await service.create(otherTeacher, cs102.id, monday({ roomId: roomB, startTime: '13:00', endTime: '15:00' }));
    await service.setOverride(otherTeacher, theirs.id, NEXT_MONDAY, { roomId: mine.roomId });

    expect(
      await rejection(service.setOverride(owner, mine.id, NEXT_MONDAY, { endTime: '14:00' })),
    ).toMatchObject({ status: 409, code: 'ROOM_CONFLICT' });
  });

  it('ยกเลิกการเปลี่ยนได้ และยกเลิกของที่ไม่มีได้ 404 OVERRIDE_NOT_FOUND', async () => {
    const { owner, cs101, repo, synced, service, monday } = setup();
    const schedule = await service.create(owner, cs101.id, monday());
    await service.setOverride(owner, schedule.id, NEXT_MONDAY, { cancelled: true });
    await service.clearOverride(owner, schedule.id, NEXT_MONDAY);

    expect(repo.overrides).toEqual([]);
    expect(synced).toHaveLength(3);
    expect(await rejection(service.clearOverride(owner, schedule.id, NEXT_MONDAY))).toMatchObject({
      status: 404,
      code: 'OVERRIDE_NOT_FOUND',
    });
  });

  it('ดูการเปลี่ยนเฉพาะวันได้ไม่เกิน 31 วันต่อครั้ง', async () => {
    const { owner, cs101, service } = setup();
    expect(
      (await rejection(service.listOverrides(owner, cs101.id, '2026-10-01', '2026-11-15'))).status,
    ).toBe(400);
    expect(
      (await rejection(service.listOverrides(owner, cs101.id, '2026-10-31', '2026-10-01'))).status,
    ).toBe(400);
  });
});
