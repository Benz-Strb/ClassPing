import type { AppConfig } from '../config/config.js';
import type { AppUser } from '../users/users.service.js';
import type { LiveRepo } from './live.repo.js';
import { LiveFaces } from '../attendance/live-faces.js';
import type { RosterService } from '../courses/roster.service.js';
import { LiveService } from './live.service.js';
import { verifyMediaToken } from './media-token.js';
import type { WatchableSession } from './video-access.js';

const SECRET = 't'.repeat(32);
// เสาร์ 24 ต.ค. 2569 09:10 เวลาไทย
const NOW = new Date('2026-10-24T02:10:00Z');
const S1 = '22222222-2222-2222-2222-222222222222';

const person = (id: string, role: AppUser['role']): AppUser => ({
  id,
  email: `${id}@dpu.ac.th`,
  fullName: null,
  role,
  studentId: null,
  pdpaConsentAt: null,
  identityVerifiedAt: null,
});
const owner = person('owner', 'teacher');
const proctor = person('proctor', 'teacher');
const other = person('other', 'teacher');
const admin = person('admin', 'admin');

const make = (patch: Partial<WatchableSession>): WatchableSession => ({
  id: S1,
  kind: 'class',
  title: null,
  courseId: 'c1',
  courseCode: 'CS101',
  courseName: 'ทดสอบ',
  teacherId: owner.id,
  roomId: 'r1',
  roomName: 'ห้อง 1',
  startsAt: new Date('2026-10-24T02:00:00Z'),
  endsAt: new Date('2026-10-24T04:00:00Z'),
  proctorIds: [],
  cameraId: '11111111-1111-1111-1111-111111111111',
  ...patch,
});

function setup(
  sessions: WatchableSession[],
  opts: { secret?: boolean; current?: string | null } = {},
) {
  const views: string[] = [];
  const dates: string[] = [];
  const repo: LiveRepo = {
    session: async (id) => sessions.find((s) => s.id === id) ?? null,
    previousEndInRoom: async () => null,
    sessionsOnDate: async (date) => {
      dates.push(date);
      return sessions;
    },
    logView: async (sessionId, userId, kind) => void views.push(`${kind} ${sessionId} ${userId}`),
  };
  const config = {
    mediaTokenSecret: opts.secret === false ? null : SECRET,
    mediaWebrtcUrl: 'http://media.test:8889',
    cameraOpenBeforeMin: 20,
  } as AppConfig;
  const liveFaces = new LiveFaces();
  const roster = {
    entries: async () => [
      { studentCode: '66000001', userId: 'ua', fullName: 'สมชาย ใจดี' },
      { studentCode: '66000002', userId: null, fullName: null },
    ],
  } as unknown as Pick<RosterService, 'entries'>;
  // คาบปัจจุบันของห้อง ค่าเริ่มต้น = คาบในห้องนั้นที่กล้องเปิดอยู่ตอนนี้
  const cameras = {
    liveSessionFor: async (camera: { roomId: string }) => {
      if (opts.current !== undefined)
        return opts.current === null ? null : ({ id: opts.current } as never);
      const open = sessions.find(
        (s) =>
          s.roomId === camera.roomId &&
          s.startsAt.getTime() - 20 * 60_000 <= NOW.getTime() &&
          NOW < s.endsAt,
      );
      return open ? ({ id: open.id } as never) : null;
    },
  };
  const service = new LiveService(repo, config, () => NOW, liveFaces, roster, cameras);
  return { service, views, dates, liveFaces };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; code: string };
    return { status: e.getStatus(), code: e.code };
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

describe('LiveService.listForDate', () => {
  const classA = make({ id: 'a' });
  const examB = make({
    id: 'b',
    roomId: 'r2',
    kind: 'exam',
    title: 'สอบ',
    teacherId: other.id,
    proctorIds: [proctor.id],
  });
  const classC = make({ id: 'c', roomId: 'r3', teacherId: other.id, cameraId: null });

  it('แต่ละคนเห็นเฉพาะคาบที่ดูได้', async () => {
    const { service } = setup([classA, examB, classC]);
    expect((await service.listForDate(owner, '2026-10-24')).map((s) => s.id)).toEqual(['a']);
    expect((await service.listForDate(proctor, '2026-10-24')).map((s) => s.id)).toEqual(['b']);
    expect((await service.listForDate(admin, '2026-10-24')).map((s) => s.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('บอกว่ากล้องเปิดอยู่ไหม มีกล้องไหม และดาวน์โหลดได้ไหม', async () => {
    const { service } = setup([classA, examB, classC]);
    const [a, b, c] = await service.listForDate(admin, '2026-10-24');
    expect(a).toMatchObject({
      status: 'live',
      cameraOpen: true,
      hasCamera: true,
      canDownload: true,
    });
    expect(c).toMatchObject({ hasCamera: false, cameraOpen: false });
    const [mine] = await setup([examB]).service.listForDate(proctor, '2026-10-24');
    expect(mine).toMatchObject({ kind: 'exam', title: 'สอบ', canDownload: false });
    void b;
  });

  it('กล้องเปิดก่อนเวลา 20 นาที ถือว่าเปิดอยู่ หมดคาบแล้วไม่เปิด', async () => {
    const soon = make({ id: 'soon', roomId: 'r2', startsAt: new Date('2026-10-24T02:25:00Z') });
    const ended = make({ id: 'ended', roomId: 'r3', endsAt: new Date('2026-10-24T02:10:00Z') });
    const [s, e] = await setup([soon, ended]).service.listForDate(admin, '2026-10-24');
    expect(s).toMatchObject({ status: 'upcoming', cameraOpen: true });
    expect(e).toMatchObject({ status: 'ended', cameraOpen: false });
  });

  it('วันที่ผิดรูปแบบได้ 400', async () => {
    expect((await rejection(setup([]).service.listForDate(admin, '24-10-2026'))).status).toBe(400);
  });
});

describe('LiveService.startLive', () => {
  it('ออก token ดูสดอายุ 60 วิ ผูก path ของกล้องในห้อง และบันทึกการเปิดดู', async () => {
    const { service, views } = setup([make({})]);
    const result = await service.startLive(owner, S1);
    expect(result.whepUrl).toBe(
      'http://media.test:8889/cam/11111111-1111-1111-1111-111111111111/whep',
    );
    expect(verifyMediaToken(SECRET, result.token, NOW)).toEqual({
      sub: owner.id,
      path: 'cam/11111111-1111-1111-1111-111111111111',
      act: 'read',
      sid: S1,
      exp: NOW.getTime() + 60_000,
    });
    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(result.session).toMatchObject({ courseCode: 'CS101', roomName: 'ห้อง 1' });
    expect(views).toEqual([`live ${S1} ${owner.id}`]);
  });

  it('ไม่มีสิทธิ์หรือไม่มีคาบได้ 404 และไม่บันทึก (คนคุมสอบที่ถูกเอาออกแล้วด้วย)', async () => {
    const { service, views } = setup([make({ kind: 'exam', title: 'สอบ', proctorIds: [] })]);
    expect((await rejection(service.startLive(proctor, S1))).code).toBe('SESSION_NOT_FOUND');
    expect((await rejection(service.startLive(other, S1))).code).toBe('SESSION_NOT_FOUND');
    expect((await rejection(service.startLive(owner, 'nope'))).code).toBe('SESSION_NOT_FOUND');
    expect(views).toEqual([]);
  });

  it('กล้องยังไม่เปิดหรือหมดคาบได้ 409 NOT_LIVE · ห้องไม่มีกล้องได้ 409 NO_CAMERA', async () => {
    const later = make({
      startsAt: new Date('2026-10-24T05:00:00Z'),
      endsAt: new Date('2026-10-24T06:00:00Z'),
    });
    expect((await rejection(setup([later]).service.startLive(owner, S1))).code).toBe('NOT_LIVE');
    const ended = make({ endsAt: NOW });
    expect((await rejection(setup([ended]).service.startLive(owner, S1))).code).toBe('NOT_LIVE');
    const noCam = make({ cameraId: null });
    expect((await rejection(setup([noCam]).service.startLive(owner, S1))).code).toBe('NO_CAMERA');
  });

  it('ห้องยังมีคาบก่อนหน้าอยู่ (กล้องเปิดก่อนเวลา) ขอดูไม่ได้ 409 NOT_LIVE และรายการขึ้นว่ายังไม่เปิด', async () => {
    const before = '33333333-3333-3333-3333-333333333333';
    const { service } = setup([make({})], { current: before });
    expect((await rejection(service.startLive(owner, S1))).code).toBe('NOT_LIVE');
    const [row] = await service.listForDate(owner, '2026-10-24');
    expect(row.cameraOpen).toBe(false);
  });

  it('ยังไม่ได้ตั้ง MEDIA_TOKEN_SECRET ได้ 503', async () => {
    const result = await rejection(
      setup([make({})], { secret: false }).service.startLive(owner, S1),
    );
    expect(result).toEqual({ status: 503, code: 'MEDIA_NOT_CONFIGURED' });
  });
});

describe('LiveService.faces', () => {
  it('ตอบกรอบล่าสุด เรียงซ้ายไปขวาพร้อมเลขที่ ชื่อ รหัส และไม่บันทึกการเปิดดูซ้ำ', async () => {
    const { service, liveFaces, views } = setup([make({})]);
    liveFaces.set(S1, new Date(NOW.getTime() - 500), [
      { box: [0.6, 0.2, 0.7, 0.3], userId: null, kind: 'unknown' },
      { box: [0.1, 0.2, 0.2, 0.3], userId: 'ua', kind: 'match' },
      { box: [0.3, 0.2, 0.4, 0.3], userId: 'ua', kind: 'review' },
    ]);
    expect(await service.faces(owner, S1)).toEqual({
      at: new Date(NOW.getTime() - 500).toISOString(),
      faces: [
        {
          n: 1,
          box: [0.1, 0.2, 0.2, 0.3],
          kind: 'match',
          name: 'สมชาย ใจดี',
          studentCode: '66000001',
        },
        {
          n: 2,
          box: [0.3, 0.2, 0.4, 0.3],
          kind: 'review',
          name: 'สมชาย ใจดี',
          studentCode: '66000001',
        },
        { n: 3, box: [0.6, 0.2, 0.7, 0.3], kind: 'unknown', name: null, studentCode: null },
      ],
    });
    expect(views).toEqual([]);
  });

  it('ยังไม่มีผลหรือผลเก่าเกิน ได้รายการว่าง', async () => {
    const { service } = setup([make({})]);
    expect(await service.faces(owner, S1)).toEqual({ at: null, faces: [] });
  });

  it('ไม่มีสิทธิ์ดูคาบนี้ได้ 404', async () => {
    const { service } = setup([make({})]);
    expect((await rejection(service.faces(other, S1))).code).toBe('SESSION_NOT_FOUND');
  });
});
