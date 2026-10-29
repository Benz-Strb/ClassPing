import type { AppConfig } from '../config/config.js';
import { randomUUID } from 'node:crypto';
import type { Course, CoursesRepo } from '../courses/courses.repo.js';
import { CoursesService } from '../courses/courses.service.js';
import type { Override, Schedule, SchedulesRepo } from '../schedules/schedules.repo.js';
import type { AppUser } from '../users/users.service.js';
import type { NewSessionRow, SessionRow, SessionsRepo } from './sessions.repo.js';
import { SessionsService } from './sessions.service.js';

// อังคาร 20 ต.ค. 2569 10:00 เวลาไทย → ช่วงสร้างคาบคือ 20–26 ต.ค.
const NOW = new Date('2026-10-20T03:00:00Z');
const TODAY = '2026-10-20';
const NEXT_MONDAY = '2026-10-26';

class InMemorySessionsRepo implements SessionsRepo {
  rows = new Map<string, SessionRow>();
  writes = 0;

  async listByCourse(courseId: string, from: string, to: string) {
    await new Promise((resolve) => setImmediate(resolve));
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
  // unique เหมือนใน DB: (course_id, starts_at) และ (schedule_id, on_date)
  private clash(
    row: Pick<SessionRow, 'courseId' | 'startsAt' | 'scheduleId' | 'onDate'>,
    ignoreId?: string,
  ) {
    return [...this.rows.values()].some(
      (r) =>
        r.id !== ignoreId &&
        ((r.courseId === row.courseId && r.startsAt.getTime() === row.startsAt.getTime()) ||
          (row.scheduleId !== null && r.scheduleId === row.scheduleId && r.onDate === row.onDate)),
    );
  }
  async insert(sessions: NewSessionRow[]) {
    await new Promise((resolve) => setImmediate(resolve));
    this.writes++;
    if (sessions.some((s) => this.clash(s))) throw new Error('duplicate key 23505');
    for (const s of sessions) {
      const id = randomUUID();
      this.rows.set(id, { kind: 'class', title: null, ...s, id, roomName: `ห้อง ${s.roomId}` });
    }
  }
  async update(id: string, patch: Pick<SessionRow, 'roomId' | 'startsAt' | 'endsAt'>) {
    this.writes++;
    if (this.clash({ ...this.rows.get(id)!, ...patch }, id)) throw new Error('duplicate key 23505');
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

function setup(openBeforeMin = 0) {
  const owner = user();
  const course: Course = { id: randomUUID(), code: 'CS101', name: 'x', section: null, teacherId: owner.id };
  const courses = new CoursesService({
    findById: async (id: string) => (id === course.id ? course : null),
  } as unknown as CoursesRepo);

  const schedules: Schedule[] = [];
  let overrides: Override[] = [];
  const broken = new Set<string>();
  const schedulesRepo = {
    listAll: async () => schedules,
    listByCourse: async (courseId: string) => {
      if (broken.has(courseId)) throw new Error('db error');
      return schedules.filter((s) => s.courseId === courseId);
    },
    listOverrides: async (ids: string[], from: string, to: string) =>
      overrides.filter((o) => ids.includes(o.scheduleId) && o.onDate >= from && o.onDate <= to),
  } as unknown as SchedulesRepo;

  const repo = new InMemorySessionsRepo();
  let now = NOW;
  const service = new SessionsService(courses, schedulesRepo, repo, () => now, {
    cameraOpenBeforeMin: openBeforeMin,
  } as AppConfig);

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

  return { owner, course, repo, service, addSchedule, setOverride, removeSchedule, sessions, setNow, broken };
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

  it('กล้องเปิดก่อนคาบแล้ว (20 นาที) ถือว่าคาบเริ่มแล้ว งดสอนไม่ทำให้คาบหาย', async () => {
    const { course, service, addSchedule, setOverride, sessions } = setup(20);
    // ตอนนี้ 10:00 คาบ 10:15 กล้องเปิดไปแล้ว คาบ 10:30 ยังไม่เปิด
    const soon = addSchedule({ weekday: 2, startTime: '10:15', endTime: '10:45' });
    const later = addSchedule({ weekday: 2, startTime: '10:45', endTime: '11:30' });
    await service.syncCourse(course.id);
    expect(sessions()).toHaveLength(2);

    setOverride({ scheduleId: soon.id, onDate: TODAY, cancelled: true });
    setOverride({ scheduleId: later.id, onDate: TODAY, cancelled: true });
    await service.syncCourse(course.id);
    expect(sessions().map((s) => s.scheduleId)).toEqual([soon.id]);
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

describe('SessionsService กับคาบสอบ', () => {
  const exam = (
    courseId: string,
    onDate: string,
    startsAt: string,
    endsAt: string,
  ): SessionRow => ({
    id: randomUUID(),
    kind: 'exam',
    title: 'สอบกลางภาค',
    scheduleId: null,
    courseId,
    roomId: 'B',
    roomName: 'ห้อง B',
    onDate,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  });

  it('sync ไม่ลบหรือแก้คาบสอบ ทั้งที่กล้องยังไม่เปิดและเปิดแล้ว', async () => {
    const { course, repo, service, addSchedule, sessions } = setup(20);
    addSchedule();
    const later = exam(course.id, '2026-10-23', '2026-10-23T02:00:00Z', '2026-10-23T04:00:00Z');
    const soon = exam(course.id, TODAY, '2026-10-20T03:10:00Z', '2026-10-20T05:00:00Z');
    repo.rows.set(later.id, later);
    repo.rows.set(soon.id, soon);

    await service.syncCourse(course.id);
    await service.syncAll();
    const kept = sessions().filter((s) => s.kind === 'exam');
    expect(kept).toEqual([later, soon]);
  });

  it('คาบสอบแทนคาบเรียนของวิชาเดียวกันที่ทับ ลบคาบสอบแล้วคาบเรียนกลับมา', async () => {
    const { course, repo, service, addSchedule, sessions } = setup();
    addSchedule(); // จันทร์ 09:00-12:00
    await service.syncCourse(course.id);
    const midterm = exam(course.id, NEXT_MONDAY, '2026-10-26T03:00:00Z', '2026-10-26T04:00:00Z');
    repo.rows.set(midterm.id, midterm);

    await service.syncCourse(course.id);
    expect(sessions().map((s) => s.kind)).toEqual(['exam']);

    repo.rows.delete(midterm.id);
    await service.syncCourse(course.id);
    expect(sessions().map((s) => [s.kind, s.onDate])).toEqual([['class', NEXT_MONDAY]]);
  });

  it('clearClassesFor เอาคาบเรียนที่ทับช่วงสอบออก ไม่แตะคาบอื่น', async () => {
    const { course, service, addSchedule, sessions } = setup();
    addSchedule(); // จันทร์ 09:00-12:00
    addSchedule({ weekday: 1, startTime: '13:00', endTime: '15:00' });
    await service.syncCourse(course.id);
    const slot = {
      onDate: NEXT_MONDAY,
      startsAt: new Date('2026-10-26T03:00:00Z'),
      endsAt: new Date('2026-10-26T04:00:00Z'),
    };
    await service.clearClassesFor(course.id, slot, async () => undefined);
    expect(sessions().map((s) => s.startsAt)).toEqual([new Date('2026-10-26T06:00:00Z')]);
  });

  it('clearClassesFor บันทึกคาบสอบในคิวเดียวกัน sync ที่แทรกมาไม่สร้างคาบเรียนคืน', async () => {
    const { course, repo, service, addSchedule, sessions } = setup();
    addSchedule(); // จันทร์ 09:00-12:00
    await service.syncCourse(course.id);
    const midterm = exam(course.id, NEXT_MONDAY, '2026-10-26T02:00:00Z', '2026-10-26T04:00:00Z');
    const replacing = service.clearClassesFor(course.id, midterm, async () => {
      await Promise.resolve();
      repo.rows.set(midterm.id, midterm);
    });
    const hourly = service.syncCourse(course.id);
    await Promise.all([replacing, hourly]);
    expect(sessions().map((s) => s.kind)).toEqual(['exam']);
  });

  it('clearClassesFor คาบเรียนที่ทับเริ่มเช็คชื่อแล้ว ได้ SESSION_STARTED และไม่ลบ', async () => {
    const { course, service, addSchedule, sessions } = setup(20);
    addSchedule({ weekday: 2, startTime: '10:15', endTime: '12:00' });
    await service.syncCourse(course.id);
    const slot = {
      onDate: TODAY,
      startsAt: new Date('2026-10-20T04:00:00Z'),
      endsAt: new Date('2026-10-20T05:00:00Z'),
    };
    const result = await rejection(service.clearClassesFor(course.id, slot, async () => undefined));
    expect(result.code).toBe('SESSION_STARTED');
    expect(sessions()).toHaveLength(1);
  });

  it('รายการคาบของวิชาแสดงคาบสอบพร้อมชื่อ', async () => {
    const { owner, course, repo, service } = setup();
    const row = exam(course.id, '2026-10-23', '2026-10-23T02:00:00Z', '2026-10-23T04:00:00Z');
    repo.rows.set(row.id, row);
    const list = await service.listForCourse(owner, course.id, TODAY, NEXT_MONDAY);
    expect(list.map((s) => [s.kind, s.title])).toEqual([['exam', 'สอบกลางภาค']]);
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

describe('SessionsService กันพังตอนสร้างคาบ', () => {
  it('ลบแล้วเพิ่มตารางใหม่ระหว่างคาบ คาบเดิมที่เวลาเดียวกันยังอยู่ และ sync ไม่พัง', async () => {
    const { course, service, addSchedule, removeSchedule, sessions } = setup();
    // คาบ 09:00 วันนี้เริ่มไปแล้ว
    const old = addSchedule({ weekday: 2, startTime: '09:00', endTime: '12:00' });
    await service.syncCourse(course.id);
    removeSchedule(old.id);
    addSchedule({ weekday: 2, startTime: '09:00', endTime: '12:00' });

    await service.syncCourse(course.id);
    expect(sessions()).toHaveLength(1);
  });

  it('syncAll วิชาหนึ่งพัง วิชาอื่นยังได้คาบ', async () => {
    const { course, service, addSchedule, sessions, broken } = setup();
    const other = randomUUID();
    broken.add(course.id);
    addSchedule();
    addSchedule({ courseId: other });

    await service.syncAll();
    expect(sessions().map((s) => s.courseId)).toEqual([other]);
  });

  it('sync วิชาเดียวกันพร้อมกันสองครั้ง ไม่ได้คาบซ้ำและไม่ error', async () => {
    const { course, service, addSchedule, sessions } = setup();
    addSchedule();
    await Promise.all([service.syncCourse(course.id), service.syncCourse(course.id)]);
    expect(sessions()).toHaveLength(1);
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
      scheduleId: expect.any(String),
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
