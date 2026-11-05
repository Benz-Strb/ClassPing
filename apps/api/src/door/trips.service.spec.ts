import type { AttendanceAdminRepo, SessionInfo } from '../attendance/attendance-admin.repo.js';
import type { AttendanceRepo } from '../attendance/attendance.repo.js';
import type { AttendanceService, SessionAttendance } from '../attendance/attendance.service.js';
import { AppError } from '../common/app-error.js';
import type { CoursesService } from '../courses/courses.service.js';
import type { RosterService } from '../courses/roster.service.js';
import type { AppUser } from '../users/users.service.js';
import type { BackChange, CourseTrip, DoorRepo, StoredTrip } from './door.repo.js';
import { OpenTrips } from './open-trips.js';
import { TripsService } from './trips.service.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const START = new Date('2026-10-23T02:00:00Z');
const ENDS = new Date('2026-10-23T05:00:00Z');
const at = (minute: number) => new Date(START.getTime() + minute * 60_000);
const TRIP_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const teacher: AppUser = {
  id: 't1',
  email: 'somsak@dpu.ac.th',
  fullName: 'สมศักดิ์',
  role: 'teacher',
  studentId: null,
  pdpaConsentAt: null,
  identityVerifiedAt: null,
};

const session: SessionInfo = {
  id: SESSION_ID,
  kind: 'class',
  title: null,
  lateAfterMin: null,
  absentAfterMin: null,
  outOfRoomLimitMin: null,
  courseId: 'c1',
  scheduleId: null,
  roomId: 'r1',
  roomName: 'ห้อง 1',
  onDate: '2026-10-23',
  startsAt: START,
  endsAt: ENDS,
};

const roster = [
  { studentCode: '66000001', userId: 'u1', fullName: 'หนึ่ง' },
  { studentCode: '66000002', userId: 'u2', fullName: 'สอง' },
  { studentCode: '66000004', userId: null, fullName: null },
];

function trip(over: Partial<StoredTrip> & { id: string }): StoredTrip {
  return {
    userId: 'u1',
    status: 'confirmed',
    outAt: at(10),
    backAt: null,
    backBy: null,
    confidence: 0.8,
    imagePath: `${SESSION_ID}/door/${over.id}.jpg`,
    ...over,
  };
}

// ฐานข้อมูลปลอมในหน่วยความจำ จำการเรียกที่เปลี่ยนข้อมูลไว้ตรวจ
class FakeDoorRepo implements DoorRepo {
  trips: StoredTrip[] = [];
  course: CourseTrip[] = [];
  calls: unknown[][] = [];
  collide = false;
  // คาบอื่นมีรอบของตัวเองด้วย ไว้ตรวจว่าไม่ปนกัน
  otherSessionTripIds = new Set<string>();

  async insertTrip() {
    return true;
  }
  async openTripUserIds() {
    return this.trips.filter((t) => t.backAt === null && t.userId).map((t) => t.userId!);
  }
  async closeTrip() {
    return false;
  }
  async unknownTripsBefore() {
    return [];
  }
  async deleteTrips() {}
  async listTrips(sessionId: string) {
    this.calls.push(['listTrips', sessionId]);
    // ฐานจริงคืนสำเนาใหม่ทุกครั้ง
    return this.trips.map((t) => ({ ...t }));
  }
  async setBack(sessionId: string, tripId: string, backAt: Date, teacherId: string) {
    this.calls.push(['setBack', sessionId, tripId, backAt, teacherId]);
    const t = this.trips.find((x) => x.id === tripId && x.status === 'confirmed');
    if (!t) return false;
    t.backAt = backAt;
    t.backBy = 'teacher';
    return true;
  }
  async deleteTrip(sessionId: string, tripId: string) {
    this.calls.push(['deleteTrip', sessionId, tripId]);
    const before = this.trips.length;
    this.trips = this.trips.filter((x) => x.id !== tripId);
    return this.trips.length < before;
  }
  async identify(sessionId: string, tripId: string, userId: string, back: BackChange) {
    this.calls.push(['identify', sessionId, tripId, userId, back]);
    if (this.collide) throw new AppError(409, 'TRIP_OPEN', 'x');
    const t = this.trips.find((x) => x.id === tripId && x.status !== 'confirmed');
    if (!t) return false;
    t.userId = userId;
    t.status = 'confirmed';
    if (back === 'clear') {
      t.backAt = null;
      t.backBy = null;
    } else if (typeof back === 'object') {
      t.backAt = back.at;
      t.backBy = 'teacher';
    }
    return true;
  }
  async courseTrips(courseId: string, from: string, to: string) {
    this.calls.push(['courseTrips', courseId, from, to]);
    return this.course;
  }
}

function setup() {
  const door = new FakeDoorRepo();
  const removed: string[][] = [];
  const signed: string[][] = [];
  const reply = { session: {}, rows: [], unknown: [] } as unknown as SessionAttendance;
  const attendance = {
    owned: async (user: AppUser, id: string) => {
      if (user.id !== 't1' || id !== SESSION_ID) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'ไม่พบคาบนี้');
      }
      return session;
    },
    view: async () => reply,
  } as unknown as AttendanceService;
  const courses = {
    getOwned: async (user: AppUser, courseId: string) => {
      if (user.role !== 'admin' && user.id !== 't1') {
        throw new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบวิชานี้');
      }
      return { id: courseId };
    },
  } as unknown as CoursesService;
  const rosterService = { entries: async () => roster } as unknown as RosterService;
  const admin = {
    rules: async () => ({ lateAfterMin: 15, absentAfterMin: null, outOfRoomLimitMin: 15 }),
    signCaptures: async (paths: string[]) => (signed.push(paths), new Map<string, string>()),
  } as unknown as AttendanceAdminRepo;
  const captures = {
    removeCaptures: async (paths: string[]) => void removed.push(paths),
  } as unknown as AttendanceRepo;
  const openTrips = new OpenTrips(door, () => at(30));
  const service = new TripsService(
    attendance,
    courses,
    rosterService,
    admin,
    captures,
    door,
    openTrips,
  );
  // โหลดแคช OpenTrips ก่อนแก้ จะได้เห็นว่าหลังแก้ตรงกับฐานหรือไม่
  const openUsers = async () => {
    const out: string[] = [];
    for (const u of ['u1', 'u2']) if (await openTrips.has(SESSION_ID, u)) out.push(u);
    return out;
  };
  const dbOpenUsers = async () => (await door.openTripUserIds()).sort();
  return { door, service, reply, removed, openTrips, openUsers, dbOpenUsers, signed };
}

describe('TripsService.setBack (PATCH)', () => {
  it('ตั้งเวลากลับ ตั้ง back_by teacher และคืนผลทั้งคาบ', async () => {
    const { service, door, reply } = setup();
    door.trips = [trip({ id: TRIP_ID, backAt: at(20), backBy: 'front' })];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(25).toISOString() }),
    ).resolves.toBe(reply);
    expect(door.calls).toContainEqual(['setBack', SESSION_ID, TRIP_ID, at(25), 't1']);
  });

  it.each([
    ['เท่ากับเวลาออก', () => at(10)],
    ['ก่อนเวลาออก', () => at(5)],
    ['หลังหมดคาบ', () => new Date(ENDS.getTime() + 1000)],
  ])('backAt %s ได้ 400 BAD_BACK_TIME', async (_n, when) => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID })];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: when().toISOString() }),
    ).rejects.toMatchObject({ status: 400, code: 'BAD_BACK_TIME' });
    expect(door.calls.some((c) => c[0] === 'setBack')).toBe(false);
  });

  it('backAt เท่ากับเวลาหมดคาบได้', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID })];
    await service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: ENDS.toISOString() });
    expect(door.trips[0].backAt).toEqual(ENDS);
  });

  it('ไม่ใช่เวลา ISO ได้ 400', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID })];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: 'พรุ่งนี้' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('ทับช่วงรอบอื่นของคนเดียวกัน 409 TRIP_OVERLAP', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, outAt: at(10), backAt: at(15), backBy: 'front' }),
      trip({ id: OTHER_ID, outAt: at(20), backAt: at(30), backBy: 'front' }),
    ];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(21).toISOString() }),
    ).rejects.toMatchObject({ status: 409, code: 'TRIP_OVERLAP' });
  });

  it('ชนรอบอื่นที่ยังไม่กลับของคนเดียวกัน 409 TRIP_OVERLAP', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, outAt: at(10), backAt: at(15), backBy: 'front' }),
      trip({ id: OTHER_ID, outAt: at(20) }),
    ];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(25).toISOString() }),
    ).rejects.toMatchObject({ code: 'TRIP_OVERLAP' });
  });

  it('รอบของคนอื่นที่เวลาซ้อนกันไม่นับ และกลับตรงเวลาที่รอบถัดไปออกได้', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, outAt: at(10) }),
      trip({ id: OTHER_ID, userId: 'u2', outAt: at(12), backAt: at(18), backBy: 'front' }),
      trip({ id: 'x3', outAt: at(20), backAt: at(25), backBy: 'front' }),
    ];
    await service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(20).toISOString() });
    expect(door.trips[0].backAt).toEqual(at(20));
  });

  it('แก้ได้เฉพาะรอบ confirmed ไม่งั้น 409 TRIP_NOT_CONFIRMED', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending' })];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(25).toISOString() }),
    ).rejects.toMatchObject({ status: 409, code: 'TRIP_NOT_CONFIRMED' });
  });

  it('ไม่มีรอบนี้ในคาบนี้ 404 TRIP_NOT_FOUND (รวมรหัสผิดรูปแบบ)', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: OTHER_ID })];
    await expect(
      service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(25).toISOString() }),
    ).rejects.toMatchObject({ status: 404, code: 'TRIP_NOT_FOUND' });
    await expect(
      service.setBack(teacher, SESSION_ID, 'nope', { backAt: at(25).toISOString() }),
    ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
  });

  it('คาบของวิชาอื่น 404 SESSION_NOT_FOUND', async () => {
    const { service } = setup();
    await expect(
      service.setBack({ ...teacher, id: 't2' }, SESSION_ID, TRIP_ID, {
        backAt: at(25).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 404, code: 'SESSION_NOT_FOUND' });
  });

  it('ปิดรอบที่ยังไม่กลับ OpenTrips เอาคนนั้นออก ตรงกับฐาน', async () => {
    const { service, door, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID })];
    expect(await openUsers()).toEqual(['u1']);
    await service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(25).toISOString() });
    expect(await openUsers()).toEqual([]);
    expect(await dbOpenUsers()).toEqual([]);
  });

  it('แก้เวลากลับของรอบที่ปิดแล้ว OpenTrips ไม่เปลี่ยน', async () => {
    const { service, door, openUsers } = setup();
    door.trips = [
      trip({ id: TRIP_ID, backAt: at(15), backBy: 'front' }),
      trip({ id: OTHER_ID, userId: 'u2' }),
    ];
    expect(await openUsers()).toEqual(['u2']);
    await service.setBack(teacher, SESSION_ID, TRIP_ID, { backAt: at(16).toISOString() });
    expect(await openUsers()).toEqual(['u2']);
  });
});

describe('TripsService.remove (DELETE)', () => {
  it('ลบรอบและรูปของรอบ แล้วคืนผลทั้งคาบ', async () => {
    const { service, door, removed, reply } = setup();
    door.trips = [trip({ id: TRIP_ID, backAt: at(15), backBy: 'front' })];
    await expect(service.remove(teacher, SESSION_ID, TRIP_ID)).resolves.toBe(reply);
    expect(door.calls).toContainEqual(['deleteTrip', SESSION_ID, TRIP_ID]);
    expect(door.trips).toEqual([]);
    expect(removed).toEqual([[`${SESSION_ID}/door/${TRIP_ID}.jpg`]]);
  });

  it('รอบที่ไม่มีรูปไม่เรียกลบไฟล์', async () => {
    const { service, door, removed } = setup();
    door.trips = [trip({ id: TRIP_ID, imagePath: null })];
    await service.remove(teacher, SESSION_ID, TRIP_ID);
    expect(removed).toEqual([]);
  });

  it('ลบรอบที่ยังไม่กลับ OpenTrips เอาคนนั้นออก ตรงกับฐาน', async () => {
    const { service, door, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID })];
    expect(await openUsers()).toEqual(['u1']);
    await service.remove(teacher, SESSION_ID, TRIP_ID);
    expect(await openUsers()).toEqual([]);
    expect(await dbOpenUsers()).toEqual([]);
  });

  it('รอบ unknown ไม่มีคน ลบได้และไม่แตะ OpenTrips', async () => {
    const { service, door, openUsers } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'unknown', userId: null }),
      trip({ id: OTHER_ID, userId: 'u2' }),
    ];
    expect(await openUsers()).toEqual(['u2']);
    await service.remove(teacher, SESSION_ID, TRIP_ID);
    expect(await openUsers()).toEqual(['u2']);
  });

  it('ไม่มีรอบนี้ 404 TRIP_NOT_FOUND และไม่ลบอะไร', async () => {
    const { service, door, removed } = setup();
    door.trips = [trip({ id: OTHER_ID })];
    await expect(service.remove(teacher, SESSION_ID, TRIP_ID)).rejects.toMatchObject({
      status: 404,
      code: 'TRIP_NOT_FOUND',
    });
    expect(door.trips).toHaveLength(1);
    expect(removed).toEqual([]);
  });
});

describe('TripsService.review', () => {
  it('confirm รอบ pending ที่ยังไม่กลับ เวลาไม่เปลี่ยน OpenTrips ยังมีคนนั้น', async () => {
    const { service, door, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending' })];
    expect(await openUsers()).toEqual(['u1']);
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'confirm' });
    expect(door.calls).toContainEqual(['identify', SESSION_ID, TRIP_ID, 'u1', 'keep']);
    expect(door.trips[0]).toMatchObject({ status: 'confirmed', userId: 'u1', backAt: null });
    expect(await openUsers()).toEqual(['u1']);
    expect(await dbOpenUsers()).toEqual(['u1']);
  });

  it('confirm รอบ pending ที่กลับแล้ว เก็บเวลากลับเดิมไว้', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending', backAt: at(20), backBy: 'front' })];
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'confirm' });
    expect(door.trips[0]).toMatchObject({ status: 'confirmed', backAt: at(20), backBy: 'front' });
  });

  it('confirm รอบ unknown ได้ 409 TRIP_NOT_REVIEWABLE', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'unknown', userId: null })];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'confirm' }),
    ).rejects.toMatchObject({ status: 409, code: 'TRIP_NOT_REVIEWABLE' });
  });

  it.each([
    { action: 'confirm' },
    { action: 'reject' },
    { action: 'reassign', toCode: '66000002' },
  ])('รอบ confirmed ใช้ review ไม่ได้ ($action) 409 TRIP_NOT_REVIEWABLE', async (body) => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID })];
    await expect(service.review(teacher, SESSION_ID, TRIP_ID, body)).rejects.toMatchObject({
      status: 409,
      code: 'TRIP_NOT_REVIEWABLE',
    });
    expect(door.trips).toHaveLength(1);
  });

  it('คำสั่งไม่ถูกต้อง 400', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending' })];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'nope' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reject ลบรอบกับรูป และเอาคนที่เดาไว้ออกจาก OpenTrips', async () => {
    const { service, door, removed, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending' })];
    expect(await openUsers()).toEqual(['u1']);
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reject' });
    expect(door.trips).toEqual([]);
    expect(removed).toEqual([[`${SESSION_ID}/door/${TRIP_ID}.jpg`]]);
    expect(await openUsers()).toEqual([]);
    expect(await dbOpenUsers()).toEqual([]);
  });

  it('reject รอบ unknown ได้', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'unknown', userId: null })];
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reject' });
    expect(door.trips).toEqual([]);
  });

  it('reassign รอบ unknown ให้คนที่ไม่มีรอบเปิด OpenTrips เพิ่มคนใหม่', async () => {
    const { service, door, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'unknown', userId: null })];
    expect(await openUsers()).toEqual([]);
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' });
    expect(door.trips[0]).toMatchObject({ status: 'confirmed', userId: 'u2' });
    expect(await openUsers()).toEqual(['u2']);
    expect(await dbOpenUsers()).toEqual(['u2']);
  });

  it('reassign รอบ pending ที่ยังไม่กลับ เอาคนเดิมออก ใส่คนใหม่', async () => {
    const { service, door, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending', userId: 'u1' })];
    expect(await openUsers()).toEqual(['u1']);
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' });
    expect(await openUsers()).toEqual(['u2']);
    expect(await dbOpenUsers()).toEqual(['u2']);
  });

  it('reassign รอบที่กลับแล้วโดยกล้องหน้า ล้างเวลากลับ (เป็นของคนอื่น) แล้วนับเป็นรอบเปิด', async () => {
    const { service, door, openUsers, dbOpenUsers } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'pending', backAt: at(20), backBy: 'front' })];
    expect(await openUsers()).toEqual([]);
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' });
    expect(door.calls).toContainEqual(['identify', SESSION_ID, TRIP_ID, 'u2', 'clear']);
    expect(door.trips[0]).toMatchObject({ userId: 'u2', backAt: null, backBy: null });
    expect(await openUsers()).toEqual(['u2']);
    expect(await dbOpenUsers()).toEqual(['u2']);
  });

  it('reassign ให้คนเดิมที่เดาไว้ ไม่ล้างเวลากลับที่กล้องจับได้', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'pending', userId: 'u1', backAt: at(20), backBy: 'front' }),
    ];
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000001' });
    expect(door.calls).toContainEqual(['identify', SESSION_ID, TRIP_ID, 'u1', 'keep']);
    expect(door.trips[0]).toMatchObject({ status: 'confirmed', backAt: at(20), backBy: 'front' });
  });

  describe('reassign พร้อม backAt', () => {
    // ออก 10:00 ไม่เห็นหน้า (unknown) กลับโดยไม่ถูกเห็น แล้วออกอีกรอบ ถูกจำได้ กลับแล้ว
    const scenario = () => [
      trip({ id: TRIP_ID, status: 'unknown', userId: null, outAt: at(10) }),
      trip({ id: OTHER_ID, userId: 'u2', outAt: at(30), backAt: at(40), backBy: 'front' }),
    ];
    const body = (backAt?: string) => ({ action: 'reassign', toCode: '66000002', backAt });

    it('ไม่มี backAt ชนรอบหลังของคนนั้น 409 TRIP_OVERLAP', async () => {
      const { service, door } = setup();
      door.trips = scenario();
      await expect(service.review(teacher, SESSION_ID, TRIP_ID, body())).rejects.toMatchObject({
        status: 409,
        code: 'TRIP_OVERLAP',
      });
    });

    it('มี backAt ก่อนรอบหลัง ระบุตัวสำเร็จ ปิดรอบ ตั้ง back_by teacher และไม่เพิ่ม OpenTrips', async () => {
      const { service, door, openUsers, dbOpenUsers } = setup();
      door.trips = scenario();
      expect(await openUsers()).toEqual([]);
      await service.review(teacher, SESSION_ID, TRIP_ID, body(at(20).toISOString()));
      expect(door.calls).toContainEqual([
        'identify',
        SESSION_ID,
        TRIP_ID,
        'u2',
        { at: at(20), by: 't1' },
      ]);
      expect(door.trips[0]).toMatchObject({
        status: 'confirmed',
        userId: 'u2',
        backAt: at(20),
        backBy: 'teacher',
      });
      expect(await openUsers()).toEqual([]);
      expect(await dbOpenUsers()).toEqual([]);
    });

    it('มี backAt แล้วคนนั้นมีรอบเปิดที่ออกทีหลังอยู่ ไม่ชนถ้าเวลาไม่ทับ', async () => {
      const { service, door, openUsers } = setup();
      door.trips = [
        trip({ id: TRIP_ID, status: 'unknown', userId: null, outAt: at(10) }),
        trip({ id: OTHER_ID, userId: 'u2', outAt: at(30) }),
      ];
      expect(await openUsers()).toEqual(['u2']);
      await service.review(teacher, SESSION_ID, TRIP_ID, body(at(20).toISOString()));
      expect(door.trips[0]).toMatchObject({ userId: 'u2', backAt: at(20) });
      expect(await openUsers()).toEqual(['u2']);
    });

    it('มี backAt แต่ทับรอบหลัง 409 TRIP_OVERLAP', async () => {
      const { service, door } = setup();
      door.trips = scenario();
      await expect(
        service.review(teacher, SESSION_ID, TRIP_ID, body(at(35).toISOString())),
      ).rejects.toMatchObject({ status: 409, code: 'TRIP_OVERLAP' });
      expect(door.trips[0].status).toBe('unknown');
    });

    it.each([
      ['เท่ากับเวลาออก', () => at(10)],
      ['ก่อนเวลาออก', () => at(5)],
      ['หลังหมดคาบ', () => new Date(ENDS.getTime() + 1000)],
    ])('backAt %s ได้ 400 BAD_BACK_TIME', async (_n, when) => {
      const { service, door } = setup();
      door.trips = scenario();
      await expect(
        service.review(teacher, SESSION_ID, TRIP_ID, body(when().toISOString())),
      ).rejects.toMatchObject({ status: 400, code: 'BAD_BACK_TIME' });
      expect(door.calls.some((c) => c[0] === 'identify')).toBe(false);
    });

    it('รอบ pending ที่กล้องหน้าห้องปิดไว้ ถ้าส่ง backAt ใช้เวลาของอาจารย์แทน', async () => {
      const { service, door } = setup();
      door.trips = [trip({ id: TRIP_ID, status: 'pending', backAt: at(20), backBy: 'front' })];
      await service.review(teacher, SESSION_ID, TRIP_ID, body(at(25).toISOString()));
      expect(door.trips[0]).toMatchObject({ userId: 'u2', backAt: at(25), backBy: 'teacher' });
    });
  });

  it('reassign ให้คนที่มีรอบเปิดอยู่แล้ว 409 TRIP_OPEN และไม่เปลี่ยนอะไร', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'unknown', userId: null }),
      trip({ id: OTHER_ID, userId: 'u2' }),
    ];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' }),
    ).rejects.toMatchObject({ status: 409, code: 'TRIP_OPEN' });
    expect(door.trips[0].status).toBe('unknown');
  });

  it('รอบที่กล้องหน้าปิดไว้ถูกเปิดใหม่ตอนเปลี่ยนคน ก็ชน TRIP_OPEN ได้', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'pending', backAt: at(20), backBy: 'front' }),
      trip({ id: OTHER_ID, userId: 'u2', outAt: at(30) }),
    ];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' }),
    ).rejects.toMatchObject({ code: 'TRIP_OPEN' });
  });

  it('reassign ที่ฐานชน unique index ก็เป็น 409 TRIP_OPEN', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'unknown', userId: null })];
    door.collide = true;
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' }),
    ).rejects.toMatchObject({ status: 409, code: 'TRIP_OPEN' });
  });

  it('reassign ให้คนที่มีรอบปิดไปทับช่วงเวลา 409 TRIP_OVERLAP', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'pending', outAt: at(10), backAt: at(20), backBy: 'teacher' }),
      trip({ id: OTHER_ID, userId: 'u2', outAt: at(15), backAt: at(25), backBy: 'front' }),
    ];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' }),
    ).rejects.toMatchObject({ status: 409, code: 'TRIP_OVERLAP' });
  });

  it('reassign รอบเปิด ที่ออกก่อนรอบปิดของคนใหม่ ทับกัน 409 TRIP_OVERLAP (ต้องกรอก backAt)', async () => {
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'unknown', userId: null, outAt: at(10) }),
      trip({ id: OTHER_ID, userId: 'u2', outAt: at(15), backAt: at(25), backBy: 'front' }),
    ];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000002' }),
    ).rejects.toMatchObject({ code: 'TRIP_OVERLAP' });
  });

  it('รหัสไม่อยู่ในวิชา 400 · ยังไม่เคย login 409 NO_ACCOUNT', async () => {
    const { service, door } = setup();
    door.trips = [trip({ id: TRIP_ID, status: 'unknown', userId: null })];
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '99999999' }),
    ).rejects.toMatchObject({ status: 400, code: 'STUDENT_NOT_IN_COURSE' });
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reassign', toCode: '66000004' }),
    ).rejects.toMatchObject({ status: 409, code: 'NO_ACCOUNT' });
  });

  it('review ไม่ตั้ง updated_by จึงให้กล้องหน้าห้องปิดรอบต่อได้', async () => {
    // closeTrip กรอง updated_by is null; มีแค่ setBack เท่านั้นที่เขียน updated_by
    const { service, door } = setup();
    door.trips = [
      trip({ id: TRIP_ID, status: 'pending' }),
      trip({ id: OTHER_ID, status: 'unknown', userId: null }),
    ];
    await service.review(teacher, SESSION_ID, TRIP_ID, { action: 'confirm' });
    await service.review(teacher, SESSION_ID, OTHER_ID, { action: 'reassign', toCode: '66000002' });
    expect(door.calls.filter((c) => c[0] === 'identify')).toHaveLength(2);
    expect(door.calls.some((c) => c[0] === 'setBack')).toBe(false);
  });

  it('ไม่มีรอบนี้ 404 TRIP_NOT_FOUND', async () => {
    const { service } = setup();
    await expect(
      service.review(teacher, SESSION_ID, TRIP_ID, { action: 'reject' }),
    ).rejects.toMatchObject({ status: 404, code: 'TRIP_NOT_FOUND' });
  });
});

describe('TripsService.report', () => {
  const row = (over: Partial<CourseTrip>): CourseTrip => ({
    sessionId: 's1',
    onDate: '2026-10-23',
    kind: 'class',
    endsAt: ENDS,
    lateAfterMin: null,
    absentAfterMin: null,
    outOfRoomLimitMin: null,
    studentCode: '66000001',
    outAt: at(10),
    backAt: at(20),
    ...over,
  });

  it('วิชาของคนอื่น 404', async () => {
    const { service } = setup();
    await expect(
      service.report({ ...teacher, id: 't2' }, 'c1', { from: '2026-10-01', to: '2026-10-31' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('แอดมินดูได้', async () => {
    const { service } = setup();
    await expect(
      service.report({ ...teacher, id: 'a1', role: 'admin' }, 'c1', {
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    [{ from: '2026-10-31', to: '2026-10-01' }],
    [{ from: '2025-10-01', to: '2026-10-02' }],
    [{ from: '2026-10-01' }],
    [{ from: 'x', to: '2026-10-02' }],
    [{ from: '2026-02-30', to: '2026-03-02' }],
  ])('ช่วงวันที่ไม่ถูกต้อง %j ได้ 400', async (query) => {
    const { service, door } = setup();
    await expect(service.report(teacher, 'c1', query)).rejects.toMatchObject({ status: 400 });
    expect(door.calls.some((c) => c[0] === 'courseTrips')).toBe(false);
  });

  it('ช่วงพอดี 1 ปี ผ่าน และส่งช่วงวันไปให้ฐาน', async () => {
    const { service, door } = setup();
    await service.report(teacher, 'c1', { from: '2025-10-01', to: '2026-10-01' });
    expect(door.calls).toContainEqual(['courseTrips', 'c1', '2025-10-01', '2026-10-01']);
  });

  it('รวมวินาทีต่อคนต่อคาบ รอบที่ยังไม่กลับนับถึงหมดคาบ และติดป้ายตามเกณฑ์', async () => {
    const { service, door } = setup();
    door.course = [
      row({ outAt: at(10), backAt: at(20) }), // 600
      row({ outAt: at(100), backAt: null }), // ถึง 05:00 = 80 นาที
      row({ studentCode: '66000002', outAt: at(10), backAt: at(15) }), // 300
      row({ sessionId: 's0', onDate: '2026-10-20', outAt: at(10), backAt: at(40) }), // 1800 > 15 = gone
    ];
    const out = await service.report(teacher, 'c1', { from: '2026-10-01', to: '2026-10-31' });
    expect(out).toEqual([
      {
        sessionId: 's0',
        onDate: '2026-10-20',
        kind: 'class',
        studentCode: '66000001',
        totalSeconds: 1800,
        label: 'gone',
        trips: [{ outAt: at(10).toISOString(), backAt: at(40).toISOString() }],
      },
      {
        sessionId: 's1',
        onDate: '2026-10-23',
        kind: 'class',
        studentCode: '66000001',
        totalSeconds: 600 + 80 * 60,
        label: 'gone_no_return',
        trips: [
          { outAt: at(10).toISOString(), backAt: at(20).toISOString() },
          { outAt: at(100).toISOString(), backAt: null },
        ],
      },
      {
        sessionId: 's1',
        onDate: '2026-10-23',
        kind: 'class',
        studentCode: '66000002',
        totalSeconds: 300,
        label: 'out',
        trips: [{ outAt: at(10).toISOString(), backAt: at(15).toISOString() }],
      },
    ]);
  });

  it('คาบสอบใช้เกณฑ์ของคาบ', async () => {
    const { service, door } = setup();
    door.course = [row({ kind: 'exam', outOfRoomLimitMin: 5, outAt: at(10), backAt: at(17) })];
    const out = await service.report(teacher, 'c1', { from: '2026-10-01', to: '2026-10-31' });
    expect(out[0]).toMatchObject({ kind: 'exam', totalSeconds: 420, label: 'gone' });
  });
});
