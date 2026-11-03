import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config/config.js';
import type { DetectedFace } from '../face/face.client.js';
import type {
  AttendanceRepo,
  AttendanceRow,
  CameraRecord,
  FaceEmbedding,
  SessionContext,
} from './attendance.repo.js';
import type { FrameJob } from './frame-queue.js';
import { FrameProcessor, type FrameDeps } from './frame.processor.js';
import { LiveFaces } from './live-faces.js';
import { LiveStreaks } from './live-streaks.js';
import { RejectedGuesses } from './rejected-guesses.js';

const POSES = ['front', 'left', 'right', 'up', 'down'];
const START = new Date('2026-10-23T02:00:00Z'); // 09:00

// เวกเตอร์ 3 มิติพอสำหรับทดสอบ: แกน x = นักศึกษา A, แกน y = นักศึกษา B
const A = [1, 0, 0];
const B = [0, 1, 0];
const between = [0.42, 0, 0.9075]; // cos กับ A ~0.42 = คะแนนกลาง
const stranger = [0, 0, 1];

const context: SessionContext = {
  courseId: 'c1',
  startsAt: START,
  endsAt: new Date('2026-10-23T05:00:00Z'),
  rules: { lateAfterMin: 15, absentAfterMin: null, outOfRoomLimitMin: 15 },
};

const face = (
  embedding: number[],
  crop: string | null = 'Y3JvcA==',
  bbox: [number, number, number, number] = [0, 0, 100, 100],
): DetectedFace => ({
  bbox,
  detScore: 0.9,
  embedding,
  pose: null,
  crop,
});

const job = (minute: number): FrameJob => ({
  sessionId: 's1',
  cameraId: 'cam1',
  receivedAt: new Date(START.getTime() + minute * 60_000).toISOString(),
  image: Buffer.from('frame').toString('base64'),
});

function setup(
  opts: {
    context?: SessionContext | null;
    complete?: string[];
    liveness?: boolean;
    matchLog?: boolean;
  } = {},
) {
  const rows = new Map<string, AttendanceRow & { record: CameraRecord }>();
  const uploads: string[] = [];
  const removed: string[] = [];
  const unknowns: string[] = [];
  let faces: DetectedFace[] = [];
  let failWrite = false;
  let beforeWrite = () => {};
  let detectCalls = 0;

  const embeddings: FaceEmbedding[] = [];
  for (const [userId, vector] of [
    ['a', A],
    ['b', B],
  ] as const) {
    const poses = (opts.complete ?? ['a', 'b']).includes(userId) ? POSES : POSES.slice(0, 2);
    for (const pose of poses) embeddings.push({ userId, pose, embedding: vector });
  }

  const repo: AttendanceRepo = {
    sessionContext: async () => (opts.context === undefined ? context : opts.context),
    faceEmbeddings: async (userIds) => embeddings.filter((e) => userIds.includes(e.userId)),
    find: async (_s, userId) => rows.get(userId) ?? null,
    insertIfAbsent: async (record) => {
      beforeWrite();
      if (failWrite) throw new Error('db down');
      if (rows.has(record.userId)) return false;
      rows.set(record.userId, {
        status: record.status,
        updatedBy: null,
        imagePath: record.imagePath,
        reviewReason: record.reviewReason,
        record,
      });
      return true;
    },
    replacePending: async (record) => {
      beforeWrite();
      if (failWrite) throw new Error('db down');
      const row = rows.get(record.userId);
      if (!row || row.status !== 'pending' || row.updatedBy !== null) return false;
      rows.set(record.userId, {
        status: record.status,
        updatedBy: null,
        imagePath: record.imagePath,
        reviewReason: record.reviewReason,
        record,
      });
      return true;
    },
    insertUnknown: async (_s, path) => void unknowns.push(path),
    unknownBefore: async () => [],
    deleteUnknown: async () => undefined,
    uploadCapture: async (path) => void uploads.push(path),
    removeCaptures: async (paths) => void removed.push(...paths),
  };
  const deps: FrameDeps = {
    detect: async () => {
      detectCalls++;
      return { width: 640, height: 480, faces, skippedSmall: 0 };
    },
    model: async () => 'buffalo_l',
    enrolledUserIds: async () => ['a', 'b'],
  };
  const config = {
    matchAcceptMin: 0.5,
    matchReviewMin: 0.36,
    matchLog: opts.matchLog ?? false,
    livenessMin: opts.liveness ? 0.15 : null,
    livenessStreak: 3,
  } as AppConfig;
  const rejected = new RejectedGuesses(() => new Date(START.getTime() + 3_600_000));
  const liveFaces = new LiveFaces();
  const processor = new FrameProcessor(
    repo,
    deps,
    config,
    () => new Date(START.getTime() + 3_600_000),
    rejected,
    liveFaces,
    new LiveStreaks(),
  );

  return {
    processor,
    rows,
    uploads,
    removed,
    unknowns,
    show: (list: DetectedFace[]) => (faces = list),
    breakWrites: () => (failWrite = true),
    teacherEdits: (userId: string) => {
      const row = rows.get(userId)!;
      rows.set(userId, { ...row, updatedBy: 'teacher1' });
    },
    detectCalls: () => detectCalls,
    rejected,
    liveFaces,
    // จำลองอาจารย์กดแก้ระหว่างที่กล้องกำลังอัปโหลดรูป
    whileWriting: (fn: () => void) => (beforeWrite = fn),
  };
}

describe('FrameProcessor', () => {
  it('คาบหายไปแล้วไม่ทำอะไร', async () => {
    const t = setup({ context: null });
    t.show([face(A)]);
    await expect(t.processor.process(job(0))).resolves.toEqual({
      matched: 0,
      review: 0,
      unknown: 0,
    });
    expect(t.detectCalls()).toBe(0);
  });

  it('หน้ามั่นใจบันทึกมาพร้อมรูปครอป 1 ไฟล์ ใช้เวลาที่ API รับภาพ', async () => {
    const t = setup();
    t.show([face(A)]);
    await expect(t.processor.process(job(5))).resolves.toEqual({
      matched: 1,
      review: 0,
      unknown: 0,
    });
    const row = t.rows.get('a')!;
    expect(row.status).toBe('present');
    expect(row.record.firstSeenAt).toEqual(new Date(job(5).receivedAt));
    expect(row.record.confidence).toBeCloseTo(1);
    expect(t.uploads).toHaveLength(1);
    expect(t.uploads[0]).toMatch(/^s1\/a-[0-9a-f-]{36}\.jpg$/);
  });

  it('คนเดิมเฟรมถัดไปไม่อัปโหลดใหม่ และไม่เปลี่ยนมาเป็นสาย', async () => {
    const t = setup();
    t.show([face(A)]);
    await t.processor.process(job(5));
    await t.processor.process(job(30));
    expect(t.rows.get('a')!.status).toBe('present');
    expect(t.uploads).toHaveLength(1);
  });

  it('คะแนนกลางเป็นรอตรวจ แล้วเจอแบบมั่นใจทีหลังแทนที่และลบรูปเก่า', async () => {
    const t = setup();
    t.show([face(between)]);
    await expect(t.processor.process(job(5))).resolves.toMatchObject({ review: 1 });
    expect(t.rows.get('a')!.status).toBe('pending');
    const oldPath = t.uploads[0];

    t.show([face(A)]);
    await t.processor.process(job(20));
    expect(t.rows.get('a')!.status).toBe('late');
    expect(t.removed).toEqual([oldPath]);
  });

  it('แถวที่อาจารย์แก้แล้ว กล้องไม่แตะ', async () => {
    const t = setup();
    t.show([face(between)]);
    await t.processor.process(job(5));
    t.teacherEdits('a');
    t.show([face(A)]);
    await t.processor.process(job(6));
    expect(t.rows.get('a')!.status).toBe('pending');
    expect(t.uploads).toHaveLength(1);
  });

  it('หน้าที่ไม่รู้จักเก็บครั้งเดียวต่อคนต่อคาบ', async () => {
    const t = setup();
    t.show([face(stranger)]);
    await t.processor.process(job(1));
    await t.processor.process(job(2));
    expect(t.unknowns).toHaveLength(1);
    expect(t.unknowns[0]).toMatch(/^s1\/unknown-[0-9a-f-]{36}\.jpg$/);
    expect(t.rows.size).toBe(0);
  });

  it('คนที่ลงทะเบียนไม่ครบทุกท่าไม่ถูกเอามาเทียบ', async () => {
    const t = setup({ complete: ['b'] });
    t.show([face(A)]);
    await expect(t.processor.process(job(1))).resolves.toMatchObject({ unknown: 1 });
    expect(t.rows.size).toBe(0);
  });

  it('ไม่มีใครลงทะเบียนครบ ทุกหน้าเป็นไม่รู้จัก ไม่ error', async () => {
    const t = setup({ complete: [] });
    t.show([face(A), face(B)]);
    await expect(t.processor.process(job(1))).resolves.toEqual({
      matched: 0,
      review: 0,
      unknown: 2,
    });
  });

  it('อัปโหลดรูปได้แต่บันทึกแถวพัง ลบไฟล์ที่เพิ่งอัปโหลด', async () => {
    const t = setup();
    t.breakWrites();
    t.show([face(A)]);
    await expect(t.processor.process(job(1))).rejects.toThrow('db down');
    expect(t.removed).toEqual(t.uploads);
  });

  it('ไม่มีรูปครอป ยังบันทึกผลได้โดยไม่มีรูป', async () => {
    const t = setup();
    t.show([face(A, null)]);
    await t.processor.process(job(1));
    expect(t.rows.get('a')!.imagePath).toBeNull();
    expect(t.uploads).toEqual([]);
  });

  it('อาจารย์แก้แถวระหว่างที่กล้องกำลังบันทึก ผลของอาจารย์ไม่ถูกทับ และลบรูปที่เพิ่งอัปโหลด', async () => {
    const t = setup();
    t.show([face(between)]);
    await t.processor.process(job(5));
    const pendingImage = t.uploads[0];

    t.whileWriting(() => t.teacherEdits('a'));
    t.show([face(A)]);
    await t.processor.process(job(6));
    expect(t.rows.get('a')).toMatchObject({ status: 'pending', updatedBy: 'teacher1' });
    expect(t.removed).toEqual([t.uploads[1]]);
    expect(t.removed).not.toContain(pendingImage);
  });

  it('มีแถวเกิดขึ้นก่อนกล้องเขียน (เช่นอาจารย์ตั้งสถานะเอง) ไม่เขียนทับ และลบรูปที่เพิ่งอัปโหลด', async () => {
    const t = setup();
    t.whileWriting(() => {
      t.rows.set('a', {
        status: 'absent',
        updatedBy: 'teacher1',
        imagePath: null,
        reviewReason: null,
        record: {} as CameraRecord,
      });
    });
    t.show([face(A)]);
    await t.processor.process(job(1));
    expect(t.rows.get('a')?.status).toBe('absent');
    expect(t.removed).toEqual(t.uploads);
  });

  it('คนที่อาจารย์บอกว่าไม่ใช่ ไม่ถูกเดาเป็นรอตรวจซ้ำในคาบเดิม แต่ถ้ามั่นใจยังบันทึกได้', async () => {
    const t = setup();
    t.rejected.reject('s1', 'a', context.endsAt);
    t.show([face(between)]);
    await expect(t.processor.process(job(5))).resolves.toEqual({
      matched: 0,
      review: 0,
      unknown: 1,
    });
    expect(t.rows.size).toBe(0);

    t.show([face(A)]);
    await t.processor.process(job(6));
    expect(t.rows.get('a')?.status).toBe('present');
  });
});

describe('FrameProcessor กรอบหน้าสำหรับกล้องสด', () => {
  it('เก็บกรอบทุกหน้าในเฟรมเป็นสัดส่วนของภาพ พร้อมว่าเป็นใคร/ไม่แน่ใจ/ไม่รู้จัก', async () => {
    const { processor, show, liveFaces } = setup();
    show([
      face(A, 'Y3JvcA==', [64, 48, 128, 96]),
      face(between, 'Y3JvcA==', [320, 240, 384, 288]),
      face(stranger, 'Y3JvcA==', [0, 0, 64, 48]),
    ]);
    await processor.process(job(1));
    expect(liveFaces.get('s1', new Date(job(1).receivedAt))).toEqual({
      at: new Date(job(1).receivedAt),
      faces: [
        { box: [0.1, 0.1, 0.2, 0.2], userId: 'a', kind: 'match' },
        { box: [0.5, 0.5, 0.6, 0.6], userId: 'a', kind: 'review' },
        { box: [0, 0, 0.1, 0.1], userId: null, kind: 'unknown' },
      ],
    });
  });

  it('เฟรมที่ไม่มีหน้า ล้างกรอบเก่า', async () => {
    const { processor, show, liveFaces } = setup();
    show([face(A)]);
    await processor.process(job(1));
    show([]);
    await processor.process(job(1));
    expect(liveFaces.get('s1', new Date(job(1).receivedAt))?.faces).toEqual([]);
  });
});

describe('FrameProcessor liveness', () => {
  const withLiveness = (embedding: number[], liveness: number | null) => ({
    ...face(embedding),
    liveness,
  });

  it('match + spoof: รอตรวจพร้อมเหตุผล spoof และกรอบเป็น review', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(A, 0.05)]);
    await t.processor.process(job(1));
    expect(t.rows.get('a')?.record).toMatchObject({ status: 'pending', reviewReason: 'spoof' });
    expect(t.liveFaces.get('s1', new Date(job(1).receivedAt))?.faces[0]).toMatchObject({
      userId: 'a',
      kind: 'review',
    });
  });

  it('review + spoof: รอตรวจพร้อมเหตุผล spoof', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(between, 0.05)]);
    await t.processor.process(job(1));
    expect(t.rows.get('a')?.record).toMatchObject({ status: 'pending', reviewReason: 'spoof' });
  });

  it('match + live หรือไม่มีคะแนน บันทึกตามเวลาเหมือนเดิม', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(A, 0.9), withLiveness(B, null)]);
    await t.processor.process(job(1));
    expect(t.rows.get('a')?.record).toMatchObject({ status: 'present', reviewReason: null });
    expect(t.rows.get('b')?.record).toMatchObject({ status: 'present', reviewReason: null });
  });

  it('ปิดฟีเจอร์ คะแนน liveness ต่ำก็ไม่มีผล', async () => {
    const t = setup();
    t.show([withLiveness(A, 0.01)]);
    await t.processor.process(job(1));
    expect(t.rows.get('a')?.record).toMatchObject({ status: 'present', reviewReason: null });
  });

  it('แถว spoof อยู่แล้ว เจอคนจริงไม่ถึงรอบ ไม่แตะแถว', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(A, 0.05)]);
    await t.processor.process(job(0));
    const before = t.rows.get('a');
    t.show([withLiveness(A, 0.9)]);
    await t.processor.process(job(1));
    await t.processor.process(job(2));
    expect(t.rows.get('a')).toBe(before);
  });

  it('คนจริงติดกันครบรอบ แทนแถว spoof โดยคิดสถานะและเวลาจากภาพแรกของรอบ', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(A, 0.05)]);
    await t.processor.process(job(0));
    t.show([withLiveness(A, 0.9)]);
    await t.processor.process(job(14));
    await t.processor.process(job(15));
    await t.processor.process(job(17));
    expect(t.rows.get('a')?.record).toMatchObject({
      status: 'present',
      reviewReason: null,
      firstSeenAt: new Date(START.getTime() + 14 * 60_000),
    });
  });

  it('ภาพ spoof คั่นกลาง นับรอบใหม่', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(A, 0.05)]);
    await t.processor.process(job(0));
    for (const [minute, score] of [
      [1, 0.9],
      [2, 0.9],
      [3, 0.05],
      [4, 0.9],
      [5, 0.9],
    ] as const) {
      t.show([withLiveness(A, score)]);
      await t.processor.process(job(minute));
    }
    expect(t.rows.get('a')?.record).toMatchObject({ status: 'pending', reviewReason: 'spoof' });
  });

  it('แถว present อยู่แล้ว เจอ spoof ไม่ลดสถานะ', async () => {
    const t = setup({ liveness: true });
    t.show([withLiveness(A, 0.9)]);
    await t.processor.process(job(1));
    t.show([withLiveness(A, 0.05)]);
    await t.processor.process(job(2));
    expect(t.rows.get('a')?.record).toMatchObject({ status: 'present', reviewReason: null });
  });

  it('matchLog พิมพ์คะแนน liveness', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const t = setup({ liveness: true, matchLog: true });
    t.show([withLiveness(A, 0.823), withLiveness(B, null)]);
    await t.processor.process(job(1));
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();
    expect(lines[0]).toContain('live 0.823');
    expect(lines[1]).toMatch(/\| -$/);
  });
});
