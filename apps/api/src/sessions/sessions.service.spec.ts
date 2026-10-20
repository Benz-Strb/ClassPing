import { randomUUID } from 'node:crypto';
import type { Course, CoursesRepo } from '../courses/courses.repo.js';
import { CoursesService } from '../courses/courses.service.js';
import type { Override, Schedule, SchedulesRepo } from '../schedules/schedules.repo.js';
import type { AppUser } from '../users/users.service.js';
import type { PlannedSession } from './plan-day.js';
import type { SessionRow, SessionsRepo } from './sessions.repo.js';
import { SessionsService } from './sessions.service.js';

// อังคาร 20 ต.ค. 2569 10:00 เวลาไทย → ช่วงสร้างคาบคือ 20–26 ต.ค.
const NOW = new Date('2026-10-20T03:00:00Z');
const TODAY = '2026-10-20';
const NEXT_MONDAY = '2026-10-26';

class InMemorySessionsRepo implements SessionsRepo {
  rows = new Map<string, SessionRow>();
  writes = 0;

  async listByCourse(courseId: string, from: string, to: string) {
    return [...this.rows.values()]
      .filter((r) => r.courseId === courseId && r.onDate >= from && r.onDate <= to)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
  async courseIdsInRange(from: string, to: string) {
    return [
      ...new Set(
        [...this.rows.values()].filter((r) => r.onDate >= from && r.onDate <= to).map((r) => r.courseId),
      ),
    ];
  }
  async insert(sessions: PlannedSession[]) {
    this.writes++;
    for (const s of sessions) {
      const id = randomUUID();
      this.rows.set(id, { id, ...s, roomName: `ห้อง ${s.roomId}` });
    }
  }
  async update(id: string, patch: Pick<SessionRow, 'roomId' | 'startsAt' | 'endsAt'>) {
    this.writes++;
    this.rows.set(id, { ...this.rows.get(id)!, ...patch, roomName: `ห้อง ${patch.roomId}` });
  }
  async remove(ids: string[]) {
    this.writes++;
    ids.forEach((id) => this.rows.delete(id));
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
  const course: Course = { id: randomUUID(), code: 'CS101', name: 'x', section: null, teacherId: owner.id };
  const courses = new CoursesService({
    findById: async (id: string) => (id === course.id ? course : null),
  } as unknown as CoursesRepo);

  const schedules: Schedule[] = [];
  let overrides: Override[] = [];
  const schedulesRepo = {
    listAll: async () => schedules,
    listByCourse: async (courseId: string) => schedules.filter((s) => s.courseId === courseId),
    listOverrides: async (ids: string[], from: string, to: string) =>
      overrides.filter((o) => ids.includes(o.scheduleId) && o.onDate >= from && o.onDate <= to),
  } as unknown as SchedulesRepo;

  const repo = new InMemorySessionsRepo();
  let now = NOW;
  const service = new SessionsService(courses, schedulesRepo, repo, () => now);

  const addSchedule = (patch: Partial<Schedule> = {}) => {
    const schedule: Schedule = {
      id: randomUUID(),
      courseId: course.id,
      weekday: 1,
      startTime: '09:00',
      endTime: '12:00',
      roomId: 'A',
      courseCode: 'CS101',
      roomName: 'ห้อง A',
      ...patch,
    };
    schedules.push(schedule);
    return schedule;
  };
  const setOverride = (o: Partial<Override> & { scheduleId: string; onDate: string }) => {
    overrides = overrides.filter((x) => !(x.scheduleId === o.scheduleId && x.onDate === o.onDate));
    overrides.push({ cancelled: false, roomId: null, startTime: null, endTime: null, ...o });
  };
  const removeSchedule = (id: string) => {
    schedules.splice(schedules.findIndex((s) => s.id === id), 1);
    // FK ใน DB เป็น on delete set null
    for (const row of repo.rows.values()) if (row.scheduleId === id) row.scheduleId = null;
  };
  const sessions = () => [...repo.rows.values()];
  const setNow = (value: Date) => (now = value);

  return { owner, course, repo, service, addSchedule, setOverride, removeSchedule, sessions, setNow };
}

describe('SessionsService.syncCourse', () => {
  it('ตารางวันจันทร์ได้คาบวันจันทร์หน้า 1 คาบ และ sync ซ้ำไม่เพิ่มไม่เขียนซ้ำ', async () => {
    const { course, repo, service, addSchedule, sessions } = setup();
    addSchedule();
    await service.syncCourse(course.id);
    const [first] = sessions();
    expect(sessions()).toHaveLength(1);
    expect(first).toMatchObject({
      onDate: NEXT_MONDAY,
      roomId: 'A',
      startsAt: new Date('2026-10-26T02:00:00Z'),
      endsAt: new Date('2026-10-26T05:00:00Z'),
    });

    const writes = repo.writes;
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([first]);
    expect(repo.writes).toBe(writes);
  });

  it('ย้ายห้องวันจันทร์หน้า แถวเดิมถูกแก้ห้อง (id เดิม)', async () => {
    const { course, service, addSchedule, setOverride, sessions } = setup();
    const schedule = addSchedule();
    await service.syncCourse(course.id);
    const before = sessions()[0];

    setOverride({ scheduleId: schedule.id, onDate: NEXT_MONDAY, roomId: 'B', startTime: '10:00' });
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([
      expect.objectContaining({
        id: before.id,
        roomId: 'B',
        startsAt: new Date('2026-10-26T03:00:00Z'),
      }),
    ]);
  });

  it('งดสอนวันจันทร์หน้า คาบนั้นถูกลบ', async () => {
    const { course, service, addSchedule, setOverride, sessions } = setup();
    const schedule = addSchedule();
    await service.syncCourse(course.id);
    setOverride({ scheduleId: schedule.id, onDate: NEXT_MONDAY, cancelled: true });
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([]);
  });

  it('คาบที่เริ่มแล้วไม่ถูกแตะ ไม่ว่าจะงดสอน ย้ายห้อง หรือลบตาราง', async () => {
    const { course, service, addSchedule, setOverride, removeSchedule, sessions } = setup();
    // วันนี้ 09:00–12:00 ตอนนี้ 10:00 = กำลังเรียน
    const tuesday = addSchedule({ weekday: 2 });
    await service.syncCourse(course.id);
    const live = sessions()[0];
    expect(live).toMatchObject({ onDate: TODAY, roomId: 'A' });

    setOverride({ scheduleId: tuesday.id, onDate: TODAY, roomId: 'B' });
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([live]);

    setOverride({ scheduleId: tuesday.id, onDate: TODAY, cancelled: true });
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([live]);

    removeSchedule(tuesday.id);
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([{ ...live, scheduleId: null }]);
  });

  it('ลบตาราง คาบในอนาคตหาย แต่คาบที่จบไปแล้วยังอยู่', async () => {
    const { course, service, addSchedule, removeSchedule, sessions, setNow } = setup();
    const tuesday = addSchedule({ weekday: 2, startTime: '07:00', endTime: '08:00' });
    // สร้างคาบตอน 06:00 ของวันนี้ (ก่อนคาบเริ่ม) แล้วเวลาผ่านไปถึง 10:00
    setNow(new Date('2026-10-19T23:00:00Z'));
    addSchedule({ weekday: 1 });
    await service.syncCourse(course.id);
    expect(sessions()).toHaveLength(2);

    setNow(NOW);
    removeSchedule(tuesday.id);
    const monday = sessions().find((s) => s.onDate === NEXT_MONDAY)!;
    removeSchedule(monday.scheduleId!);
    await service.syncCourse(course.id);
    expect(sessions()).toEqual([expect.objectContaining({ onDate: TODAY, scheduleId: null })]);
  });

  it('คาบวันนี้ที่ยังไม่เริ่มถูกสร้าง แต่คาบวันนี้ที่จบไปแล้วไม่ถูกสร้าง', async () => {
    const { course, service, addSchedule, sessions } = setup();
    addSchedule({ weekday: 2, startTime: '13:00', endTime: '15:00' });
    addSchedule({ weekday: 2, startTime: '07:00', endTime: '08:00', roomId: 'B' });
    await service.syncCourse(course.id);
    expect(sessions().map((s) => s.startsAt)).toEqual([new Date('2026-10-20T06:00:00Z')]);
  });

  it('คาบที่เลยช่วง 7 วันไม่ถูกสร้าง', async () => {
    const { course, service, addSchedule, sessions } = setup();
    // อังคารหน้า 27 ต.ค. อยู่นอกช่วง 20–26
    addSchedule({ weekday: 2, startTime: '13:00', endTime: '15:00' });
    await service.syncCourse(course.id);
    expect(sessions().map((s) => s.onDate)).toEqual([TODAY]);
  });
});

describe('SessionsService.syncAll', () => {
  it('sync วิชาที่มีตาราง และลบคาบค้างของวิชาที่ไม่มีตารางแล้ว', async () => {
    const { repo, service, addSchedule, sessions } = setup();
    addSchedule();
    const orphan = randomUUID();
    await repo.insert([
      {
        scheduleId: null,
        courseId: orphan,
        roomId: 'A',
        onDate: NEXT_MONDAY,
        startsAt: new Date('2026-10-26T06:00:00Z'),
        endsAt: new Date('2026-10-26T08:00:00Z'),
      },
    ]);

    await service.syncAll();
    expect(sessions().map((r) => r.courseId === orphan)).toEqual([false]);
  });
});

describe('SessionsService.listForCourse', () => {
  it('บอกสถานะ upcoming / live / ended ตามเวลาปัจจุบัน', async () => {
    const { owner, course, service, addSchedule, setNow } = setup();
    setNow(new Date('2026-10-19T23:00:00Z'));
    addSchedule({ weekday: 2, startTime: '07:00', endTime: '08:00' });
    addSchedule({ weekday: 2, startTime: '09:00', endTime: '12:00', roomId: 'B' });
    addSchedule({ weekday: 1 });
    await service.syncCourse(course.id);
    setNow(NOW);

    const list = await service.listForCourse(owner, course.id, TODAY, NEXT_MONDAY);
    expect(list.map((s) => [s.onDate, s.status])).toEqual([
      [TODAY, 'ended'],
      [TODAY, 'live'],
      [NEXT_MONDAY, 'upcoming'],
    ]);
    expect(list[0]).toMatchObject({
      courseId: course.id,
      roomName: 'ห้อง A',
      startsAt: '2026-10-20T00:00:00.000Z',
      endsAt: '2026-10-20T01:00:00.000Z',
    });
  });

  it('ช่วงเกิน 31 วัน หรือวันที่ผิด ได้ 400', async () => {
    const { owner, course, service } = setup();
    expect(
      (await rejection(service.listForCourse(owner, course.id, '2026-10-01', '2026-11-15'))).status,
    ).toBe(400);
    expect((await rejection(service.listForCourse(owner, course.id, 'x', TODAY))).status).toBe(400);
  });

  it('วิชาของคนอื่นได้ 404', async () => {
    const { course, service } = setup();
    expect(await rejection(service.listForCourse(user(), course.id, TODAY, TODAY))).toMatchObject({
      status: 404,
      code: 'COURSE_NOT_FOUND',
    });
  });
});
