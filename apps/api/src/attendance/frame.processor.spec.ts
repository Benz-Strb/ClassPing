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

const face = (embedding: number[], crop: string | null = 'Y3JvcA=='): DetectedFace => ({
  bbox: [0, 0, 100, 100],
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

function setup(opts: { context?: SessionContext | null; complete?: string[] } = {}) {
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
      rows.set(record.userId, { status: record.status, updatedBy: null, imagePath: record.imagePath, record });
      return true;
    },
    replacePending: async (record) => {
      beforeWrite();
      if (failWrite) throw new Error('db down');
      const row = rows.get(record.userId);
      if (!row || row.status !== 'pending' || row.updatedBy !== null) return false;
      rows.set(record.userId, { status: record.status, updatedBy: null, imagePath: record.imagePath, record });
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
  const config = { matchAcceptMin: 0.5, matchReviewMin: 0.36, matchLog: false } as AppConfig;
  const rejected = new RejectedGuesses(() => new Date(START.getTime() + 3_600_000));
  const processor = new FrameProcessor(
    repo,
    deps,
    config,
    () => new Date(START.getTime() + 3_600_000),
    rejected,
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
