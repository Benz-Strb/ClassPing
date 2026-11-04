import { Logger } from '@nestjs/common';
import type {
  AttendanceRepo,
  FaceEmbedding,
  SessionContext,
} from '../attendance/attendance.repo.js';
import type { FrameDeps } from '../attendance/frame.processor.js';
import type { AppConfig } from '../config/config.js';
import type { DetectedFace } from '../face/face.client.js';
import { DoorProcessor } from './door.processor.js';
import type { DoorRepo, NewTrip } from './door.repo.js';
import { OpenTrips } from './open-trips.js';

const POSES = ['front', 'left', 'right', 'up', 'down'];
const NOW = new Date('2026-10-23T03:00:00Z');
const OUT_AT = new Date('2026-10-23T03:05:00Z');

// แกน x = นักศึกษา A, แกน y = นักศึกษา B
const A = [1, 0, 0];
const B = [0, 1, 0];
const stranger = [0, 0, 1];
const mid = [0.42, 0, 0.9075]; // cos กับ A ~0.42
const nearBoth = [0.6, 0.6, 0.53]; // cos กับ A และ B ~0.6 สูงพอ ๆ กัน (ไม่ unit แต่ cosine normalize เอง)

const context: SessionContext = {
  courseId: 'c1',
  startsAt: new Date('2026-10-23T02:00:00Z'),
  endsAt: new Date('2026-10-23T05:00:00Z'),
  rules: { lateAfterMin: 15, absentAfterMin: null, outOfRoomLimitMin: 15 },
};

const face = (embedding: number[], crop: string | null = 'Y3JvcA=='): DetectedFace => ({
  bbox: [0, 0, 100, 100],
  detScore: 0.9,
  embedding,
  pose: null,
  crop,
});

const image = (name: string) => Buffer.from(name);

function setup(
  opts: { detect?: (call: number) => DetectedFace[] | Error; collide?: boolean } = {},
) {
  const uploads: { path: string; bytes: string }[] = [];
  const removed: string[] = [];
  const trips: NewTrip[] = [];
  let detectCalls = 0;
  let openLoads = 0;
  const open = new Set<string>();

  const embeddings: FaceEmbedding[] = [];
  for (const [userId, vector] of [
    ['a', A],
    ['b', B],
  ] as const) {
    for (const pose of POSES) embeddings.push({ userId, pose, embedding: vector });
  }

  const attendance = {
    sessionContext: async () => context,
    faceEmbeddings: async (ids: string[]) => embeddings.filter((e) => ids.includes(e.userId)),
    uploadCapture: async (path: string, bytes: Buffer) => {
      uploads.push({ path, bytes: bytes.toString() });
    },
    removeCaptures: async (paths: string[]) => void removed.push(...paths),
  } as unknown as AttendanceRepo;
  const doorRepo = {
    openTripUserIds: async () => {
      openLoads++;
      return [...open];
    },
    insertTrip: async (trip: NewTrip) => {
      if (opts.collide) return false;
      trips.push(trip);
      return true;
    },
  } as unknown as DoorRepo;
  const deps: FrameDeps = {
    detect: async () => {
      const result = opts.detect?.(detectCalls++) ?? [];
      if (result instanceof Error) throw result;
      return { width: 640, height: 480, faces: result, skippedSmall: 0 };
    },
    model: async () => 'buffalo_l',
    enrolledUserIds: async () => ['a', 'b'],
  };
  const config = { matchAcceptMin: 0.5, matchReviewMin: 0.36 } as AppConfig;
  const openTrips = new OpenTrips(doorRepo, () => NOW);
  const processor = new DoorProcessor(attendance, doorRepo, deps, config, () => NOW, openTrips);
  return {
    processor,
    openTrips,
    uploads,
    removed,
    trips,
    open,
    detectCalls: () => detectCalls,
    openLoads: () => openLoads,
  };
}

describe('DoorProcessor.handleOut', () => {
  it('หน้าตรงคนในรายชื่อ >= 0.5 ได้ confirmed อัปโหลดรูปครอปหน้า และจดว่ามีรอบเปิดอยู่', async () => {
    const { processor, uploads, trips, openTrips } = setup({ detect: () => [face(A)] });
    await expect(processor.handleOut('s1', [image('full')], OUT_AT)).resolves.toBe('confirmed');
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bytes).toBe('crop');
    expect(trips).toEqual([
      {
        sessionId: 's1',
        userId: 'a',
        status: 'confirmed',
        outAt: OUT_AT,
        confidence: 1,
        imagePath: uploads[0].path,
      },
    ]);
    expect(await openTrips.has('s1', 'a')).toBe(true);
  });

  it('คะแนน 0.36-0.5 ได้ pending ของคนที่เดา และจดว่ามีรอบเปิดอยู่', async () => {
    const { processor, trips, openTrips } = setup({ detect: () => [face(mid)] });
    await expect(processor.handleOut('s1', [image('full')], OUT_AT)).resolves.toBe('pending');
    expect(trips[0]).toMatchObject({ userId: 'a', status: 'pending' });
    expect(await openTrips.has('s1', 'a')).toBe(true);
  });

  it('สองคนคะแนนสูสีได้ pending', async () => {
    const { processor, trips } = setup({ detect: () => [face(nearBoth)] });
    await expect(processor.handleOut('s1', [image('full')], OUT_AT)).resolves.toBe('pending');
    expect(trips[0].status).toBe('pending');
    expect(trips[0].userId).not.toBeNull();
  });

  it('ต่ำกว่า 0.36 ได้ unknown ไม่มี userId เก็บรูปตัวคนรูปแรก และไม่จดว่ามีรอบเปิด', async () => {
    const { processor, uploads, trips, openLoads } = setup({ detect: () => [face(stranger)] });
    await expect(
      processor.handleOut('s1', [image('first'), image('second')], OUT_AT),
    ).resolves.toBe('unknown');
    expect(uploads.map((u) => u.bytes)).toEqual(['first']);
    expect(trips[0]).toMatchObject({ userId: null, status: 'unknown', imagePath: uploads[0].path });
    expect(openLoads()).toBe(0);
  });

  it('ไม่มีรูป ได้ unknown ไม่อัปโหลด และไม่เรียกตรวจหน้า', async () => {
    const { processor, uploads, trips, detectCalls } = setup();
    await expect(processor.handleOut('s1', [], OUT_AT)).resolves.toBe('unknown');
    expect(uploads).toEqual([]);
    expect(trips).toEqual([
      {
        sessionId: 's1',
        userId: null,
        status: 'unknown',
        outAt: OUT_AT,
        confidence: null,
        imagePath: null,
      },
    ]);
    expect(detectCalls()).toBe(0);
  });

  it('ไม่มีหน้าในทุกรูป ได้ unknown เก็บรูปแรก', async () => {
    const { processor, uploads, trips, detectCalls } = setup({ detect: () => [] });
    await expect(processor.handleOut('s1', [image('one'), image('two')], OUT_AT)).resolves.toBe(
      'unknown',
    );
    expect(detectCalls()).toBe(2);
    expect(uploads.map((u) => u.bytes)).toEqual(['one']);
    expect(trips[0]).toMatchObject({ userId: null, confidence: null });
  });

  it('หลายรูป ใช้หน้าที่คะแนนเทียบสูงสุด', async () => {
    const { processor, trips } = setup({
      detect: (call) => [[face(stranger)], [face(A, 'YQ==')], [face(mid)]][call],
    });
    await expect(
      processor.handleOut('s1', [image('1'), image('2'), image('3')], OUT_AT),
    ).resolves.toBe('confirmed');
    expect(trips[0]).toMatchObject({ userId: 'a', status: 'confirmed' });
  });

  it('คนที่มีรอบเปิดอยู่แล้ว ได้ duplicate ไม่ insert ไม่อัปโหลด', async () => {
    const { processor, uploads, trips, open } = setup({ detect: () => [face(A)] });
    open.add('a');
    await expect(processor.handleOut('s1', [image('full')], OUT_AT)).resolves.toBe('duplicate');
    expect(uploads).toEqual([]);
    expect(trips).toEqual([]);
  });

  it('คนที่เป็น pending อยู่แล้วก็ไม่เปิดรอบซ้ำ', async () => {
    const { processor, trips } = setup({ detect: () => [face(mid)] });
    await processor.handleOut('s1', [image('full')], OUT_AT);
    await expect(processor.handleOut('s1', [image('full')], OUT_AT)).resolves.toBe('duplicate');
    expect(trips).toHaveLength(1);
  });

  it('insert ชน unique index ได้ duplicate และลบรูปที่อัปโหลดไป', async () => {
    const { processor, uploads, removed, openTrips } = setup({
      detect: () => [face(A)],
      collide: true,
    });
    await expect(processor.handleOut('s1', [image('full')], OUT_AT)).resolves.toBe('duplicate');
    expect(uploads).toHaveLength(1);
    expect(removed).toEqual([uploads[0].path]);
    expect(await openTrips.has('s1', 'a')).toBe(true);
  });

  it('ตรวจหน้าพัง ได้ unknown เก็บรูปแรก แทนที่จะให้ request ล้ม', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { processor, uploads, trips } = setup({ detect: () => new Error('face down') });
    await expect(processor.handleOut('s1', [image('one'), image('two')], OUT_AT)).resolves.toBe(
      'unknown',
    );
    expect(uploads.map((u) => u.bytes)).toEqual(['one']);
    expect(trips[0]).toMatchObject({ userId: null, status: 'unknown' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
