import type { AppConfig } from '../config/config.js';
import type { AppUser } from '../users/users.service.js';
import type { LiveRepo } from './live.repo.js';
import { verifyMediaToken } from './media-token.js';
import type { PlaybackClient } from './playback.client.js';
import { RecordingService } from './recording.service.js';
import { latestUse, type WatchableSession } from './video-access.js';

const SECRET = 't'.repeat(32);
const NOW = new Date('2026-10-24T11:00:00Z');
const S1 = '22222222-2222-2222-2222-222222222222';
const CAM = '11111111-1111-1111-1111-111111111111';

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

// คาบสอบ 17:18-17:58 กล้องเปิด 16:58
const session: WatchableSession = {
  id: S1,
  kind: 'exam',
  title: 'สอบ',
  courseId: 'c1',
  courseCode: 'EXAMPLE101',
  courseName: 'test',
  teacherId: owner.id,
  roomId: 'r1',
  roomName: 'ห้องทดลอง 1',
  startsAt: new Date('2026-10-24T10:18:00Z'),
  endsAt: new Date('2026-10-24T10:58:00Z'),
  proctorIds: [proctor.id],
  cameraId: CAM,
};

function setup(
  opts: {
    segments?: { start: Date; duration: number }[];
    secret?: boolean;
    previousEnd?: Date | null;
    cancelledAt?: Date;
    gone?: boolean;
    door?: string;
  } = {},
) {
  const views: string[] = [];
  const listed: { path: string; from: Date; to: Date }[] = [];
  const repo = {
    session: async (id: string) =>
      id === S1 && !opts.gone
        ? { ...session, cancelledAt: opts.cancelledAt ?? null, doorCameraId: opts.door ?? null }
        : null,
    sessionsOnDate: async () => [],
    previousEndInRoom: async () => opts.previousEnd ?? null,
    logView: async (sid: string, uid: string, kind: string) => void views.push(`${kind} ${uid}`),
  } as LiveRepo;
  const playback: PlaybackClient = {
    list: async (path, from, to) => {
      listed.push({ path, from, to });
      return opts.segments ?? [];
    },
    clip: async () => new Response('x'),
  };
  const config = {
    mediaTokenSecret: opts.secret === false ? null : SECRET,
    cameraOpenBeforeMin: 20,
  } as AppConfig;
  return { service: new RecordingService(repo, playback, config, () => NOW), views, listed };
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

describe('RecordingService กับคาบที่ถูกลบ', () => {
  const cancelledAt = new Date('2026-10-24T10:30:00Z'); // ลบตอน 17:30 ระหว่างคาบ

  it('ดูได้ถึงตอนที่ลบ ภาพหลังจากนั้นอาจเป็นของวิชาอื่น', async () => {
    const { service, listed } = setup({
      cancelledAt,
      segments: [{ start: new Date('2026-10-24T10:20:00Z'), duration: 3600 }],
    });
    const result = await service.list(owner, S1);
    expect(listed[0].to).toEqual(cancelledAt);
    expect(result.segments).toEqual([{ start: '2026-10-24T10:20:00.000Z', duration: 600 }]);
  });

  it('ขอลิงก์ช่วงหลังลบไม่ได้', async () => {
    const { service } = setup({ cancelledAt });
    expect(
      await rejection(
        service.link(owner, S1, { start: '2026-10-24T10:40:00.000Z', duration: 60, download: false }),
      ),
    ).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('ลบก่อนกล้องเปิด ไม่มีภาพให้ดูและไม่ถามไฟล์', async () => {
    const { service, listed } = setup({ cancelledAt: new Date('2026-10-23T00:00:00Z') });
    await expect(service.list(owner, S1)).resolves.toMatchObject({ segments: [] });
    expect(listed).toEqual([]);
  });
});

describe('latestUse', () => {
  it('คาบที่ถูกลบกลางทางนับถึงตอนที่ลบ คาบปกตินับถึงเวลาจบ', () => {
    const endsAt = new Date('2026-10-24T10:00:00Z');
    const early = new Date('2026-10-24T09:00:00Z');
    expect(latestUse([])).toBeNull();
    expect(latestUse([{ endsAt, cancelledAt: null }])).toEqual(endsAt);
    expect(latestUse([{ endsAt, cancelledAt: early }])).toEqual(early);
    expect(
      latestUse([
        { endsAt, cancelledAt: early },
        { endsAt: new Date('2026-10-24T09:30:00Z'), cancelledAt: null },
      ]),
    ).toEqual(new Date('2026-10-24T09:30:00Z'));
  });
});

describe('RecordingService.list', () => {
  it('ถามไฟล์ช่วงกล้องเปิดถึงหมดคาบ ตัดส่วนที่เลยช่วงออก และบอกวันที่จะถูกลบ', async () => {
    const { service, listed } = setup({
      segments: [
        { start: new Date('2026-10-24T09:50:00Z'), duration: 1200 }, // 16:50-17:10 เริ่มก่อนกล้องเปิด
        { start: new Date('2026-10-24T10:30:00Z'), duration: 3600 }, // เลยหมดคาบ
      ],
    });
    const result = await service.list(owner, S1);
    expect(listed).toEqual([
      { path: `cam/${CAM}`, from: new Date('2026-10-24T09:58:00Z'), to: session.endsAt },
    ]);
    expect(result.session).toMatchObject({ courseCode: 'EXAMPLE101', roomName: 'ห้องทดลอง 1' });
    expect({ ...result, session: undefined }).toEqual({
      session: undefined,
      segments: [
        { start: '2026-10-24T09:58:00.000Z', duration: 720 },
        { start: '2026-10-24T10:30:00.000Z', duration: 1680 },
      ],
      cameras: ['front'],
      expiresOn: '2026-11-23T09:50:00.000Z',
      canDownload: true,
    });
  });

  it('ห้องเดียวกันมีคาบก่อนหน้าจบ 17:05 เริ่มนับไฟล์ตั้งแต่ 17:05 ไม่ใช่ 16:58 (ไม่เห็นคาบคนอื่น)', async () => {
    const previousEnd = new Date('2026-10-24T10:05:00Z');
    const { service, listed } = setup({
      previousEnd,
      segments: [{ start: new Date('2026-10-24T09:50:00Z'), duration: 1800 }],
    });
    const result = await service.list(owner, S1);
    expect(listed[0].from).toEqual(previousEnd);
    expect(result.segments).toEqual([{ start: '2026-10-24T10:05:00.000Z', duration: 900 }]);
    expect(
      (await rejection(service.link(owner, S1, body({ start: '2026-10-24T10:00:00.000Z' }))))
        .status,
    ).toBe(400);
  });

  it('คนคุมสอบดูรายการได้แต่ดาวน์โหลดไม่ได้ อาจารย์วิชาอื่นได้ 404', async () => {
    const { service } = setup();
    expect((await service.list(proctor, S1)).canDownload).toBe(false);
    expect((await rejection(service.list(other, S1))).code).toBe('SESSION_NOT_FOUND');
  });
});

const body = (patch: Record<string, unknown> = {}) => ({
  start: '2026-10-24T10:20:00.000Z',
  duration: 600,
  download: false,
  ...patch,
});

describe('RecordingService.link', () => {
  it('ดูย้อนหลัง: ลิงก์อายุ 10 นาทีบวกความยาวคลิป ผูกคาบ path และช่วงเวลา บันทึก playback', async () => {
    const { service, views } = setup();
    const { url } = await service.link(owner, S1, body());
    expect(url.startsWith('/clips/')).toBe(true);
    expect(verifyMediaToken(SECRET, url.slice('/clips/'.length), NOW)).toEqual({
      sub: owner.id,
      path: `cam/${CAM}`,
      act: 'clip',
      sid: S1,
      exp: NOW.getTime() + 10 * 60_000 + 600_000,
      start: '2026-10-24T10:20:00.000Z',
      dur: 600,
      dl: false,
      cam: 'front',
    });
    expect(views).toEqual([`playback ${owner.id}`]);
  });

  it('ดาวน์โหลด: อาจารย์ประจำวิชาได้ บันทึก download · คนคุมสอบได้ 403', async () => {
    const { service, views } = setup();
    await service.link(owner, S1, body({ download: true }));
    expect(views).toEqual([`download ${owner.id}`]);
    expect(await rejection(service.link(proctor, S1, body({ download: true })))).toEqual({
      status: 403,
      code: 'DOWNLOAD_NOT_ALLOWED',
    });
  });

  it('ช่วงเวลานอกคาบหรือยาวเกินได้ 400', async () => {
    const { service } = setup();
    const status = async (patch: Record<string, unknown>) =>
      (await rejection(service.link(owner, S1, body(patch)))).status;
    expect(await status({ start: '2026-10-24T09:00:00.000Z' })).toBe(400);
    expect(await status({ duration: 4000 })).toBe(400);
    expect(await status({ duration: 0 })).toBe(400);
    expect(await status({ start: 'yesterday' })).toBe(400);
  });

  it('ยังไม่ได้ตั้ง MEDIA_TOKEN_SECRET ได้ 503', async () => {
    expect((await rejection(setup({ secret: false }).service.link(owner, S1, body()))).status).toBe(
      503,
    );
  });
});

describe('RecordingService.openClip', () => {
  it('token ถูกต้องได้ path ช่วงเวลา และชื่อไฟล์ตอนดาวน์โหลด', async () => {
    const { service } = setup();
    const { url } = await service.link(owner, S1, body({ download: true }));
    const clip = await service.openClip(url.slice('/clips/'.length));
    expect(clip).toEqual({
      path: `cam/${CAM}`,
      start: new Date('2026-10-24T10:20:00.000Z'),
      duration: 600,
      download: true,
      filename: 'classping-20261024-1720-front.mp4',
    });
  });

  it('token หมดอายุ แก้ไข หรือเป็น token ดูสด ได้ 401', async () => {
    const { service } = setup();
    expect((await rejection(service.openClip('abc'))).status).toBe(401);
  });

  // คลิป 17:20-17:30
  it('ลิงก์ที่ออกก่อนลบคาบ เปิดไม่ได้ถ้าคลิปเลยเวลาที่ลบ แต่ช่วงก่อนลบยังเปิดได้', async () => {
    const opts: { cancelledAt?: Date } = {};
    const { service } = setup(opts);
    const { url } = await service.link(owner, S1, body());
    const token = url.slice('/clips/'.length);

    opts.cancelledAt = new Date('2026-10-24T10:25:00Z');
    expect(await rejection(service.openClip(token))).toMatchObject({
      status: 401,
      code: 'LINK_EXPIRED',
    });

    opts.cancelledAt = new Date('2026-10-24T10:40:00Z');
    await expect(service.openClip(token)).resolves.toMatchObject({ duration: 600 });
  });

  it('ลิงก์ของคาบที่ไม่มีแล้วเปิดไม่ได้', async () => {
    const opts: { gone?: boolean } = {};
    const { service } = setup(opts);
    const { url } = await service.link(owner, S1, body());
    opts.gone = true;
    expect(await rejection(service.openClip(url.slice('/clips/'.length)))).toMatchObject({
      status: 401,
    });
  });
});

describe('RecordingService กล้องประตู', () => {
  const DOOR = '33333333-3333-3333-3333-333333333333';
  const segments = [{ start: new Date('2026-10-24T10:20:00Z'), duration: 60 }];
  const doorLink = { start: '2026-10-24T10:20:00.000Z', duration: 60, camera: 'door' };

  it('ดูไฟล์ของกล้องประตูได้ และบอกว่าห้องมีกล้องอะไรบ้าง', async () => {
    const { service, listed } = setup({ door: DOOR, segments });
    const result = await service.list(owner, S1, 'door');
    expect(listed[0].path).toBe(`cam/${DOOR}`);
    expect(result.cameras).toEqual(['front', 'door']);
    const { url } = await service.link(owner, S1, doorLink);
    expect(verifyMediaToken(SECRET, url.replace('/clips/', ''), NOW)?.path).toBe(`cam/${DOOR}`);
    const download = await service.link(owner, S1, { ...doorLink, download: true });
    const clip = await service.openClip(download.url.slice('/clips/'.length));
    expect(clip.filename).toBe('classping-20261024-1720-door.mp4');
  });

  it('ห้องไม่มีกล้องประตู ไม่มีไฟล์ ขอลิงก์ไม่ได้ และชื่อกล้องผิดได้ 400', async () => {
    const { service } = setup({ segments });
    const result = await service.list(owner, S1, 'door');
    expect(result).toMatchObject({ segments: [], cameras: ['front'] });
    expect((await rejection(service.link(owner, S1, doorLink))).code).toBe('NO_RECORDING');
    expect((await rejection(service.list(owner, S1, 'side'))).code).toBe('BAD_REQUEST');
  });
});
