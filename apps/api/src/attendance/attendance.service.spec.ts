import { AppError } from '../common/app-error.js';
import { DoorEntries } from '../door/door-entries.js';
import type { DoorRepo, StoredTrip } from '../door/door.repo.js';
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
import { RejectedGuesses } from './rejected-guesses.js';

const START = new Date('2026-10-23T02:00:00Z'); // 09:00
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const teacher: AppUser = {
  id: 't1',
  email: 'somsak@dpu.ac.th',
  fullName: 'สมศักดิ์',
  role: 'teacher',
  studentId: null,
  pdpaConsentAt: null,
  identityVerifiedAt: null,
};
const student: AppUser = { ...teacher, id: 'x', role: 'student' };

const session: SessionInfo = {
  id: SESSION_ID,
  kind: 'class',
  title: null,
  lateAfterMin: null,
  absentAfterMin: null,
  outOfRoomLimitMin: null,
  courseId: 'c1',
  scheduleId: 'sch1',
  roomId: 'r1',
  roomName: 'ห้องทดลอง 1',
  onDate: '2026-10-23',
  startsAt: START,
  endsAt: new Date('2026-10-23T05:00:00Z'),
};

const roster = [
  {
    studentCode: '66000001',
    userId: 'u1',
    fullName: 'หนึ่ง',
    hasLoggedIn: true,
    faceEnrolled: true,
  },
  { studentCode: '66000002', userId: 'u2', fullName: 'สอง', hasLoggedIn: true, faceEnrolled: true },
  {
    studentCode: '66000003',
    userId: 'u3',
    fullName: 'สาม',
    hasLoggedIn: true,
    faceEnrolled: false,
  },
  {
    studentCode: '66000004',
    userId: null,
    fullName: null,
    hasLoggedIn: false,
    faceEnrolled: false,
  },
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
  async setStatus(
    _s: string,
    userId: string,
    status: StoredAttendance['status'],
    teacherId: string,
  ) {
    const row = this.rows.get(userId);
    this.rows.set(userId, {
      userId,
      status,
      firstSeenAt: row?.firstSeenAt ?? null,
      confidence: row?.confidence ?? null,
      imagePath: row?.imagePath ?? null,
      updatedBy: teacherId,
      updatedByName: 'สมศักดิ์',
      reviewReason: null,
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
    this.rows.set(to, {
      ...row,
      userId: to,
      status,
      updatedBy: teacherId,
      updatedByName: 'สมศักดิ์',
      reviewReason: null,
    });
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
  const rejected = new RejectedGuesses(() => at(30));
  const doorTrips: { list: StoredTrip[] } = { list: [] };
  const door = { listTrips: async () => doorTrips.list } as unknown as DoorRepo;
  const doorEntries = new DoorEntries(() => at(30));
  const service = new AttendanceService(
    courses,
    rosterService,
    repo,
    () => at(30),
    rejected,
    door,
    doorEntries,
  );
  const pending = (userId: string, minute = 5, reviewReason: 'spoof' | null = null) =>
    repo.rows.set(userId, {
      userId,
      status: 'pending',
      firstSeenAt: at(minute),
      confidence: 0.42,
      imagePath: `${SESSION_ID}/${userId}-x.jpg`,
      updatedBy: null,
      updatedByName: null,
      reviewReason,
    });
  return { repo, service, pending, rejected, doorTrips, doorEntries };
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

  it('คืน reviewReason ของแถวรอตรวจ', async () => {
    const { service, pending } = setup();
    pending('u1', 5, 'spoof');
    pending('u2');
    const view = await service.view(teacher, SESSION_ID);
    expect(view.rows.find((r) => r.studentCode === '66000001')?.reviewReason).toBe('spoof');
    expect(view.rows.find((r) => r.studentCode === '66000002')?.reviewReason).toBeNull();
    expect(view.rows.find((r) => r.studentCode === '66000003')?.reviewReason).toBeNull();
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
    await expect(
      service.view({ ...teacher, id: 'a1', role: 'admin' }, SESSION_ID),
    ).resolves.toBeDefined();
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
    await service.review(teacher, SESSION_ID, '66000001', {
      action: 'reassign',
      toCode: '66000003',
    });
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

  it('ไม่ใช่นักศึกษาวิชานี้: ลบแถว รูปย้ายไปหน้าที่ไม่รู้จัก และกล้องจำไว้ไม่เดาคนนี้ซ้ำ', async () => {
    const { service, repo, pending, rejected } = setup();
    pending('u1', 5);
    await service.review(teacher, SESSION_ID, '66000001', { action: 'reject' });
    expect(repo.rows.has('u1')).toBe(false);
    expect(repo.unknown).toEqual([{ imagePath: `${SESSION_ID}/u1-x.jpg`, seenAt: at(5) }]);
    expect(rejected.isRejected(SESSION_ID, 'u1')).toBe(true);
  });

  it('ไม่ใช่แถว spoof: ลบแถว เก็บรูป แต่ไม่จำว่าปฏิเสธ กล้องเห็นตัวจริงทีหลังบันทึกได้', async () => {
    const { service, repo, pending, rejected } = setup();
    pending('u1', 5, 'spoof');
    await service.review(teacher, SESSION_ID, '66000001', { action: 'reject' });
    expect(repo.rows.has('u1')).toBe(false);
    expect(repo.unknown).toEqual([{ imagePath: `${SESSION_ID}/u1-x.jpg`, seenAt: at(5) }]);
    expect(rejected.isRejected(SESSION_ID, 'u1')).toBe(false);
  });

  it('ยืนยัน / เปลี่ยนคน / ตั้งสถานะ แถว spoof: แถวใหม่ reviewReason เป็น null', async () => {
    const { service, repo, pending } = setup();
    pending('u1', 5, 'spoof');
    pending('u2', 5, 'spoof');
    await service.review(teacher, SESSION_ID, '66000001', { action: 'confirm' });
    expect(repo.rows.get('u1')?.reviewReason).toBeNull();
    await service.review(teacher, SESSION_ID, '66000002', {
      action: 'reassign',
      toCode: '66000003',
    });
    expect(repo.rows.get('u3')).toMatchObject({ status: 'present', reviewReason: null });
    pending('u2', 5, 'spoof');
    await service.setStatus(teacher, SESSION_ID, '66000002', { status: 'present' });
    expect(repo.rows.get('u2')?.reviewReason).toBeNull();
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

describe('AttendanceService.view รอบนอกห้อง', () => {
  const trip = (over: Partial<StoredTrip> & { id: string }): StoredTrip => ({
    userId: 'u1',
    status: 'confirmed',
    outAt: at(10),
    backAt: null,
    backBy: null,
    confidence: 0.8,
    imagePath: `${SESSION_ID}/door/${over.id}.jpg`,
    ...over,
  });

  it('คนที่ไม่มีรอบได้ outOfRoom ว่าง', async () => {
    const { service } = setup();
    const view = await service.view(teacher, SESSION_ID);
    expect(view.rows[0].outOfRoom).toEqual({
      totalSeconds: 0,
      minutes: 0,
      label: null,
      trips: [],
    });
  });

  it('แถวมี outOfRoom ตามเกณฑ์ของวิชา: เกินเกณฑ์เป็น gone ไม่เกินเป็น out', async () => {
    const { service, doorTrips } = setup();
    doorTrips.list = [
      // u1 รวม 16 นาที (เกณฑ์ 15)
      trip({ id: 'a', outAt: at(5), backAt: at(13), backBy: 'front' }),
      trip({ id: 'b', outAt: at(20), backAt: at(28), backBy: 'teacher' }),
      // u2 รวม 10 นาที
      trip({ id: 'c', userId: 'u2', outAt: at(5), backAt: at(15), backBy: 'front' }),
    ];
    const view = await service.view(teacher, SESSION_ID);
    const u1 = view.rows.find((r) => r.studentCode === '66000001')!;
    const u2 = view.rows.find((r) => r.studentCode === '66000002')!;
    expect(u1.outOfRoom).toMatchObject({ totalSeconds: 960, minutes: 16, label: 'gone' });
    expect(u1.outOfRoom.trips).toEqual([
      {
        id: 'a',
        outAt: at(5).toISOString(),
        backAt: at(13).toISOString(),
        backBy: 'front',
        seconds: 480,
        imageUrl: `https://signed/${SESSION_ID}/door/a.jpg`,
        suggestedBackAt: null,
      },
      expect.objectContaining({ id: 'b', backBy: 'teacher', seconds: 480 }),
    ]);
    expect(u2.outOfRoom).toMatchObject({ totalSeconds: 600, minutes: 10, label: 'out' });
  });

  it('รอบที่ยังไม่กลับนับถึงหมดคาบ ป้าย gone_no_return และเสนอเวลาเข้าแรกหลังออก', async () => {
    const { service, doorTrips, doorEntries } = setup();
    doorTrips.list = [trip({ id: 'a', outAt: at(100) })];
    doorEntries.add(SESSION_ID, at(90), session.endsAt);
    doorEntries.add(SESSION_ID, at(120), session.endsAt);
    doorEntries.add(SESSION_ID, at(110), session.endsAt);
    const view = await service.view(teacher, SESSION_ID);
    const out = view.rows.find((r) => r.studentCode === '66000001')!.outOfRoom;
    expect(out).toMatchObject({ totalSeconds: 80 * 60, label: 'gone_no_return' });
    expect(out.trips[0]).toMatchObject({
      backAt: null,
      backBy: null,
      seconds: 80 * 60,
      suggestedBackAt: at(110).toISOString(),
    });
  });

  it('รอบที่กลับแล้วไม่เสนอเวลา และรอบเปิดที่ยังไม่มีเวลาเข้า suggestedBackAt เป็น null', async () => {
    const { service, doorTrips, doorEntries } = setup();
    doorEntries.add(SESSION_ID, at(12), session.endsAt);
    doorTrips.list = [
      trip({ id: 'a', outAt: at(5), backAt: at(13), backBy: 'front' }),
      trip({ id: 'b', userId: 'u2', outAt: at(20) }),
    ];
    const view = await service.view(teacher, SESSION_ID);
    expect(view.rows.find((r) => r.studentCode === '66000001')!.outOfRoom.trips[0]).toMatchObject({
      suggestedBackAt: null,
    });
    expect(view.rows.find((r) => r.studentCode === '66000002')!.outOfRoom.trips[0]).toMatchObject({
      suggestedBackAt: null,
    });
  });

  it('คาบสอบใช้เกณฑ์ของคาบ และ session บอกเกณฑ์ที่ใช้', async () => {
    const { service, doorTrips, repo } = setup();
    const original = repo.session.bind(repo);
    repo.session = async (id: string) => {
      const s = await original(id);
      return s && { ...s, kind: 'exam' as const, outOfRoomLimitMin: 5 };
    };
    doorTrips.list = [trip({ id: 'a', outAt: at(5), backAt: at(13), backBy: 'front' })];
    const view = await service.view(teacher, SESSION_ID);
    expect(view.session.outOfRoomLimitMin).toBe(5);
    expect(view.rows.find((r) => r.studentCode === '66000001')!.outOfRoom.label).toBe('gone');
  });

  it('คาบเรียนที่ไม่ตั้งเกณฑ์ใช้ของวิชา', async () => {
    const { service } = setup();
    expect((await service.view(teacher, SESSION_ID)).session.outOfRoomLimitMin).toBe(15);
  });

  it('pending อยู่ใน tripReviews ไม่อยู่ในแถว', async () => {
    const { service, doorTrips } = setup();
    doorTrips.list = [
      trip({ id: 'p1', status: 'pending', userId: 'u2', confidence: 0.42, outAt: at(7) }),
      trip({ id: 'ok', outAt: at(5), backAt: at(6), backBy: 'front' }),
    ];
    const view = await service.view(teacher, SESSION_ID);
    expect(view.tripReviews).toEqual([
      {
        id: 'p1',
        guessCode: '66000002',
        guessName: 'สอง',
        score: 0.42,
        outAt: at(7).toISOString(),
        imageUrl: `https://signed/${SESSION_ID}/door/p1.jpg`,
      },
    ]);
    expect(view.rows.find((r) => r.studentCode === '66000002')!.outOfRoom.trips).toEqual([]);
    expect(view.rows.find((r) => r.studentCode === '66000001')!.outOfRoom.trips).toHaveLength(1);
  });

  it('unknown ล่าสุด 20 รอบ เรียงใหม่ไปเก่า และไม่อยู่ในแถว', async () => {
    const { service, doorTrips } = setup();
    doorTrips.list = Array.from({ length: 25 }, (_, i) =>
      trip({ id: `k${i}`, status: 'unknown', userId: null, outAt: at(i) }),
    );
    const view = await service.view(teacher, SESSION_ID);
    expect(view.unknownTrips).toHaveLength(20);
    expect(view.unknownTrips[0]).toEqual({
      id: 'k24',
      outAt: at(24).toISOString(),
      imageUrl: `https://signed/${SESSION_ID}/door/k24.jpg`,
    });
    expect(view.unknownTrips[19].id).toBe('k5');
    expect(view.rows.every((r) => r.outOfRoom.trips.length === 0)).toBe(true);
  });

  it('เซ็นรูปรวดเดียวทั้งรูปเช็คชื่อและรูปรอบนอกห้อง', async () => {
    const { service, doorTrips, pending, repo } = setup();
    pending('u1');
    doorTrips.list = [
      trip({ id: 'a', userId: 'u2', outAt: at(5), backAt: at(6), backBy: 'front' }),
      trip({ id: 'p', status: 'pending', userId: 'u3' }),
      trip({ id: 'k', status: 'unknown', userId: null }),
      trip({
        id: 'n',
        userId: 'u2',
        outAt: at(8),
        backAt: at(9),
        backBy: 'front',
        imagePath: null,
      }),
    ];
    await service.view(teacher, SESSION_ID);
    expect(repo.signed).toHaveLength(1);
    expect(repo.signed[0].sort()).toEqual(
      [
        `${SESSION_ID}/u1-x.jpg`,
        `${SESSION_ID}/door/a.jpg`,
        `${SESSION_ID}/door/p.jpg`,
        `${SESSION_ID}/door/k.jpg`,
      ].sort(),
    );
  });
});
