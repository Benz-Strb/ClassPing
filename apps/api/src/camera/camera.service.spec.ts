import type { AppConfig } from '../config/config.js';
import type { FrameJob, FrameQueue } from '../attendance/frame-queue.js';
import type { CameraIdentity, CameraRepo, LiveSession } from './camera.repo.js';
import { CameraService, MAX_WAITING_FRAMES } from './camera.service.js';

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

function setup(opts: { live?: LiveSession | null; waiting?: number; openBefore?: number } = {}) {
  const calls: { roomId: string; opensBy: Date; now: Date }[] = [];
  const added: FrameJob[] = [];
  const repo: CameraRepo = {
    findByTokenHash: async () => null,
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
  const config = { cameraOpenBeforeMin: opts.openBefore ?? 0 } as AppConfig;
  const service = new CameraService(repo, queue, config, () => NOW);
  return { service, calls, added };
}

describe('CameraService.currentSession', () => {
  it('ไม่มีคาบได้ null', async () => {
    const { service } = setup({ live: null });
    await expect(service.currentSession(front)).resolves.toEqual({ session: null, fps: 1 });
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
    });
  });

  it('หาคาบของห้องกล้องนี้ โดยเลื่อนเวลาเปิดตาม CAMERA_OPEN_BEFORE_MIN', async () => {
    const { service, calls } = setup({ openBefore: 10 });
    await service.currentSession(front);
    expect(calls).toEqual([
      { roomId: 'r1', opensBy: new Date('2026-10-22T02:10:00Z'), now: NOW },
    ]);
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
