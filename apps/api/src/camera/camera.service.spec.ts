import type { AppConfig } from '../config/config.js';
import type { FrameJob, FrameQueue } from '../attendance/frame-queue.js';
import type { CameraIdentity, CameraRepo, LiveSession } from './camera.repo.js';
import { CameraService, MAX_WAITING_FRAMES } from './camera.service.js';
import { verifyMediaToken } from '../media/media-token.js';
import type { DoorProcessor, TripResult } from '../door/door.processor.js';
import { DoorEntries } from '../door/door-entries.js';

const NOW = new Date('2026-10-22T02:00:00Z'); // 09:00 เวลาไทย

const front: CameraIdentity = { id: 'cam1', roomId: 'r1', kind: 'front' };
const door: CameraIdentity = { id: 'cam2', roomId: 'r1', kind: 'door' };

const session: LiveSession = {
  id: 's1',
  courseCode: 'CS101',
  courseName: 'พื้นฐานโปรแกรม',
  startsAt: new Date('2026-10-22T02:00:00Z'),
  endsAt: new Date('2026-10-22T05:00:00Z'),
};

const jpeg = (size = 100) => {
  const buffer = Buffer.alloc(size, 1);
  buffer.set([0xff, 0xd8, 0xff]);
  return { buffer, mimetype: 'image/jpeg', size };
};

function setup(
  opts: { live?: LiveSession | null; waiting?: number; openBefore?: number; media?: boolean } = {},
) {
  const calls: { roomId: string; opensBy: Date; now: Date }[] = [];
  const added: FrameJob[] = [];
  const repo: CameraRepo = {
    findByTokenHash: async () => null,
    findById: async () => null,
    touch: async () => undefined,
    liveSession: async (roomId, opensBy, now) => {
      calls.push({ roomId, opensBy, now });
      return opts.live === undefined ? session : opts.live;
    },
  };
  const queue: FrameQueue = {
    add: async (job) => {
      added.push(job);
    },
    waiting: async () => opts.waiting ?? 0,
  };
  const outs: { sessionId: string; images: Buffer[]; outAt: Date }[] = [];
  const doorProcessor = {
    handleOut: async (sessionId: string, images: Buffer[], outAt: Date): Promise<TripResult> => {
      outs.push({ sessionId, images, outAt });
      return 'confirmed';
    },
  } as unknown as DoorProcessor;
  const entries = new DoorEntries(() => NOW);
  const config = {
    cameraOpenBeforeMin: opts.openBefore ?? 0,
    mediaServerSecret: opts.media ? 's'.repeat(32) : null,
    mediaTokenSecret: opts.media ? 't'.repeat(32) : null,
    mediaRtspUrl: 'rtsp://media.test:8554',
  } as AppConfig;
  const service = new CameraService(repo, queue, config, () => NOW, doorProcessor, entries);
  return { service, calls, added, outs, entries };
}

describe('CameraService.currentSession', () => {
  it('ไม่มีคาบได้ null', async () => {
    const { service } = setup({ live: null });
    await expect(service.currentSession(front)).resolves.toEqual({
      session: null,
      fps: 1,
      stream: null,
    });
  });

  it('มีคาบได้ข้อมูลคาบเป็นเวลา ISO', async () => {
    const { service } = setup();
    await expect(service.currentSession(front)).resolves.toEqual({
      session: {
        id: 's1',
        courseCode: 'CS101',
        courseName: 'พื้นฐานโปรแกรม',
        startsAt: '2026-10-22T02:00:00.000Z',
        endsAt: '2026-10-22T05:00:00.000Z',
      },
      fps: 1,
      stream: null,
    });
  });

  it('ตั้ง media server แล้ว มีคาบ = บอกที่ส่งวิดีโอ 15 fps 1500 kbps พร้อม token ส่งวิดีโออายุ 10 นาที', async () => {
    const { service } = setup({ media: true });
    const { stream } = await service.currentSession(front);
    expect(stream).toMatchObject({ fps: 15, bitrateKbps: 1500 });
    const url = new URL(stream!.url);
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('rtsp://media.test:8554/cam/cam1');
    expect(verifyMediaToken('t'.repeat(32), url.searchParams.get('token')!, NOW)).toEqual({
      sub: 'cam1',
      path: 'cam/cam1',
      act: 'publish',
      sid: 's1',
      exp: NOW.getTime() + 10 * 60_000,
    });
  });

  it('ไม่มีคาบ หรือเป็นกล้องประตู ไม่ส่งวิดีโอ', async () => {
    await expect(
      setup({ media: true, live: null }).service.currentSession(front),
    ).resolves.toMatchObject({ stream: null });
    await expect(setup({ media: true }).service.currentSession(door)).resolves.toMatchObject({
      stream: null,
    });
  });

  it('หาคาบของห้องกล้องนี้ โดยเลื่อนเวลาเปิดตาม CAMERA_OPEN_BEFORE_MIN', async () => {
    const { service, calls } = setup({ openBefore: 10 });
    await service.currentSession(front);
    expect(calls).toEqual([{ roomId: 'r1', opensBy: new Date('2026-10-22T02:10:00Z'), now: NOW }]);
  });
});

describe('CameraService.acceptFrame', () => {
  it('ปกติเข้าคิวพร้อมเวลาที่รับภาพจากเซิร์ฟเวอร์', async () => {
    const { service, added } = setup();
    const file = jpeg();
    await expect(service.acceptFrame(front, file)).resolves.toEqual({ queued: true });
    expect(added).toEqual([
      {
        sessionId: 's1',
        cameraId: 'cam1',
        receivedAt: NOW.toISOString(),
        image: file.buffer.toString('base64'),
      },
    ]);
  });

  it('กล้องประตูได้ 403 NOT_FRONT_CAMERA', async () => {
    const { service, added } = setup();
    await expect(service.acceptFrame(door, jpeg())).rejects.toMatchObject({
      status: 403,
      code: 'NOT_FRONT_CAMERA',
    });
    expect(added).toEqual([]);
  });

  it('ไม่แนบรูป หรือไม่ใช่ JPEG ได้ 400', async () => {
    const { service } = setup();
    await expect(service.acceptFrame(front, undefined)).rejects.toMatchObject({
      status: 400,
      code: 'IMAGE_REQUIRED',
    });
    await expect(
      service.acceptFrame(front, { buffer: Buffer.from('hello'), mimetype: 'image/jpeg', size: 5 }),
    ).rejects.toMatchObject({ status: 400, code: 'UNSUPPORTED_IMAGE' });
  });

  it('ไม่มีคาบได้ 409 NO_LIVE_SESSION', async () => {
    const { service, added } = setup({ live: null });
    await expect(service.acceptFrame(front, jpeg())).rejects.toMatchObject({
      status: 409,
      code: 'NO_LIVE_SESSION',
    });
    expect(added).toEqual([]);
  });

  it('คิวค้างเกินได้ 429 BUSY', async () => {
    const { service, added } = setup({ waiting: MAX_WAITING_FRAMES + 1 });
    await expect(service.acceptFrame(front, jpeg())).rejects.toMatchObject({
      status: 429,
      code: 'BUSY',
    });
    expect(added).toEqual([]);
  });
});

describe('CameraService.acceptDoorCrossing', () => {
  it('ออก: ส่งรูปให้ DoorProcessor พร้อมเวลาที่รับจากเซิร์ฟเวอร์ และคืนผลรอบ', async () => {
    const { service, outs } = setup();
    const file = jpeg();
    await expect(service.acceptDoorCrossing(door, 'out', [file])).resolves.toEqual({
      trip: 'confirmed',
    });
    expect(outs).toEqual([{ sessionId: 's1', images: [file.buffer], outAt: NOW }]);
  });

  it('ออกโดยไม่มีรูปก็รับ', async () => {
    const { service, outs } = setup();
    await service.acceptDoorCrossing(door, 'out', []);
    expect(outs[0].images).toEqual([]);
  });

  it('เข้า: จดเวลาเข้าถึงหมดคาบ คืน trip null และไม่สนรูปที่แนบมา', async () => {
    const { service, outs, entries } = setup();
    await expect(
      service.acceptDoorCrossing(door, 'in', [
        { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 },
      ]),
    ).resolves.toEqual({ trip: null });
    expect(outs).toEqual([]);
    expect(entries.between('s1', new Date(NOW.getTime() - 1000), NOW)).toEqual([NOW]);
  });

  it('กล้องหน้าห้องได้ 403 NOT_DOOR_CAMERA', async () => {
    const { service, outs } = setup();
    await expect(service.acceptDoorCrossing(front, 'out', [])).rejects.toMatchObject({
      status: 403,
      code: 'NOT_DOOR_CAMERA',
    });
    expect(outs).toEqual([]);
  });

  it('ไม่มีคาบ หรือเลยเวลาจบ ได้ 409 NO_LIVE_SESSION', async () => {
    const { service, outs } = setup({ live: null });
    await expect(service.acceptDoorCrossing(door, 'out', [jpeg()])).rejects.toMatchObject({
      status: 409,
      code: 'NO_LIVE_SESSION',
    });
    await expect(service.acceptDoorCrossing(door, 'in', [])).rejects.toMatchObject({ status: 409 });
    expect(outs).toEqual([]);
  });

  it('ถามคาบด้วยวิธีเดียวกับกล้องหน้าห้อง (liveSession ของห้อง ณ เวลารับ)', async () => {
    const { service, calls } = setup({ openBefore: 10 });
    await service.acceptDoorCrossing(door, 'out', []);
    expect(calls).toEqual([{ roomId: 'r1', opensBy: new Date('2026-10-22T02:10:00Z'), now: NOW }]);
  });

  it('รูปไม่ใช่ JPEG ได้ 400 UNSUPPORTED_IMAGE', async () => {
    const { service, outs } = setup();
    await expect(
      service.acceptDoorCrossing(door, 'out', [
        jpeg(),
        { buffer: Buffer.from('hello'), mimetype: 'image/jpeg', size: 5 },
      ]),
    ).rejects.toMatchObject({ status: 400, code: 'UNSUPPORTED_IMAGE' });
    expect(outs).toEqual([]);
  });

  it('direction ไม่ใช่ out หรือ in ได้ 400', async () => {
    const { service } = setup();
    await expect(service.acceptDoorCrossing(door, undefined, [])).rejects.toMatchObject({
      status: 400,
      code: 'BAD_DIRECTION',
    });
    await expect(service.acceptDoorCrossing(door, 'sideways', [])).rejects.toMatchObject({
      status: 400,
      code: 'BAD_DIRECTION',
    });
  });
});

describe('CameraService.currentSession (กล้องประตู)', () => {
  it('กล้องประตูได้คาบแต่ stream เป็น null', async () => {
    const { service } = setup({ media: true });
    await expect(service.currentSession(door)).resolves.toMatchObject({
      session: { id: 's1' },
      stream: null,
    });
  });
});
