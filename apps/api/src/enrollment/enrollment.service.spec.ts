import { randomUUID } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import type { EnrollResult, FaceClient, FacePose } from '../face/face.client.js';
import type { AppUser, UsersService } from '../users/users.service.js';
import type { EnrollmentRepo, FaceRow } from './enrollment.repo.js';
import { EnrollmentService } from './enrollment.service.js';
import { PITCH_UP_SIGN, POSES, YAW_LEFT_SIGN, type Pose } from './pose-check.js';

// face_profiles + users + Storage ปลอมในหน่วยความจำ
class InMemoryEnrollmentRepo implements EnrollmentRepo {
  rows = new Map<string, Map<Pose, FaceRow>>();
  files = new Map<string, Buffer>();
  userIds = new Set<string>();

  async listByUser(userId: string) {
    return [...(this.rows.get(userId)?.values() ?? [])];
  }
  async savePose(userId: string, row: FaceRow) {
    const poses = this.rows.get(userId) ?? new Map();
    poses.set(row.pose, row);
    this.rows.set(userId, poses);
  }
  async deleteByUser(userId: string) {
    const paths = [...(this.rows.get(userId)?.values() ?? [])].map((r) => r.imagePath);
    this.rows.delete(userId);
    return paths;
  }
  async uploadImage(path: string, bytes: Buffer) {
    this.files.set(path, bytes);
  }
  async removeImages(paths: string[]) {
    paths.forEach((p) => this.files.delete(p));
  }
  async listImages(userId: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${userId}/`));
  }
  async userExists(userId: string) {
    return this.userIds.has(userId);
  }
}

const student = (patch: Partial<AppUser> = {}): AppUser => ({
  id: randomUUID(),
  email: '66112106@dpu.ac.th',
  fullName: null,
  role: 'student',
  studentId: '66112106',
  pdpaConsentAt: '2026-10-21T00:00:00.000Z',
  ...patch,
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

function storeRow(repo: InMemoryEnrollmentRepo, userId: string, pose: Pose) {
  const imagePath = `${userId}/${pose}-old.jpg`;
  repo.files.set(imagePath, Buffer.from('x'));
  return repo.savePose(userId, { pose, imagePath, embedding: [1, 0], model: 'buffalo_l' });
}

// มุมที่ผ่านของแต่ละท่า สร้างจากทิศของผู้ใช้
const ANGLE: Record<Pose, FacePose> = {
  front: { pitch: 0, yaw: 0, roll: 0 },
  left: { pitch: 0, yaw: 25 * YAW_LEFT_SIGN, roll: 0 },
  right: { pitch: 0, yaw: -25 * YAW_LEFT_SIGN, roll: 0 },
  up: { pitch: 20 * PITCH_UP_SIGN, yaw: 0, roll: 0 },
  down: { pitch: -20 * PITCH_UP_SIGN, yaw: 0, roll: 0 },
};

// face service ปลอม: ตั้งผลครั้งถัดไปได้ ค่าเริ่มต้นคือหน้าคนเดียวกับ storeRow ([1, 0])
class FakeFace {
  next: Partial<EnrollResult> | Error = {};
  calls = 0;
  async enroll(): Promise<EnrollResult> {
    this.calls++;
    if (this.next instanceof Error) throw this.next;
    return {
      embedding: [0.9, 0.1],
      bbox: [0, 0, 200, 200],
      detScore: 0.9,
      pose: ANGLE.front,
      sharpness: 100,
      model: 'buffalo_l',
      ...this.next,
    };
  }
}

// ขึ้นต้นด้วยไบต์ของ JPEG จริง เนื้อที่เหลือไม่สำคัญเพราะ face service เป็นของปลอม
const jpeg = (size = 1000) => {
  const buffer = Buffer.alloc(size, 1);
  buffer.set([0xff, 0xd8, 0xff]);
  return { buffer, mimetype: 'image/jpeg', size };
};

function setup() {
  const repo = new InMemoryEnrollmentRepo();
  const face = new FakeFace();
  const consented: string[] = [];
  const withdrawn: string[] = [];
  const users = {
    setConsent: async (userId: string) => {
      consented.push(userId);
      return student({ id: userId });
    },
    clearConsent: async (userId: string) => {
      withdrawn.push(userId);
    },
  } as unknown as UsersService;
  const service = new EnrollmentService(repo, users, face as unknown as FaceClient);
  return { repo, face, consented, withdrawn, service };
}

describe('EnrollmentService.consent', () => {
  it('บัญชีที่ไม่มีรหัสนักศึกษาได้ 403 NOT_A_STUDENT', async () => {
    const { service, consented } = setup();
    const teacher = student({ role: 'teacher', studentId: null, pdpaConsentAt: null });
    expect(await rejection(service.consent(teacher))).toMatchObject({
      status: 403,
      code: 'NOT_A_STUDENT',
    });
    expect(consented).toEqual([]);
  });

  it('นักศึกษายินยอมได้', async () => {
    const { service, consented } = setup();
    const me = student({ pdpaConsentAt: null });
    await service.consent(me);
    expect(consented).toEqual([me.id]);
  });
});

describe('EnrollmentService.status', () => {
  it('ยังไม่มีท่าไหนเลย', async () => {
    const { service } = setup();
    expect(await service.status(student())).toEqual({ done: [], complete: false });
  });

  it('เรียงท่าตามลำดับ POSES ไม่ใช่ลำดับที่ถ่าย', async () => {
    const { service, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'left');
    await storeRow(repo, me.id, 'front');
    expect(await service.status(me)).toEqual({ done: ['front', 'left'], complete: false });
  });

  it('ครบ 5 ท่าแล้ว complete', async () => {
    const { service, repo } = setup();
    const me = student();
    for (const pose of POSES) await storeRow(repo, me.id, pose);
    expect(await service.status(me)).toEqual({ done: [...POSES], complete: true });
  });

  it('บัญชีที่ไม่มีรหัสนักศึกษาได้ 403', async () => {
    const { service } = setup();
    expect(await rejection(service.status(student({ studentId: null })))).toMatchObject({
      code: 'NOT_A_STUDENT',
    });
  });
});

describe('EnrollmentService.reset', () => {
  it('ลบทุกท่าและไฟล์รูป', async () => {
    const { service, repo } = setup();
    const me = student();
    repo.userIds.add(me.id);
    await storeRow(repo, me.id, 'front');
    await storeRow(repo, me.id, 'left');

    await service.reset(me.id);

    expect(await repo.listByUser(me.id)).toEqual([]);
    expect(repo.files.size).toBe(0);
  });

  it('ยังไม่เคยลงทะเบียนก็รีเซ็ตได้', async () => {
    const { service, repo } = setup();
    const id = randomUUID();
    repo.userIds.add(id);
    await expect(service.reset(id)).resolves.toBeUndefined();
  });

  it('ลบไฟล์ที่ไม่มีแถวชี้ถึงด้วย แต่ไม่แตะโฟลเดอร์คนอื่น', async () => {
    const { service, repo } = setup();
    const me = student();
    const other = randomUUID();
    repo.userIds.add(me.id);
    await storeRow(repo, me.id, 'front');
    repo.files.set(`${me.id}/left-orphan.jpg`, Buffer.from('x'));
    repo.files.set(`${other}/front-x.jpg`, Buffer.from('x'));

    await service.reset(me.id);

    expect([...repo.files.keys()]).toEqual([`${other}/front-x.jpg`]);
  });

  it('ลบไฟล์ไม่สำเร็จได้ 503 กดรีเซ็ตซ้ำแล้วไฟล์หายครบ', async () => {
    const { service, repo } = setup();
    const me = student();
    repo.userIds.add(me.id);
    await storeRow(repo, me.id, 'front');
    const remove = repo.removeImages.bind(repo);
    repo.removeImages = async () => {
      throw new Error('storage down');
    };
    expect(await rejection(service.reset(me.id))).toMatchObject({
      status: 503,
      code: 'FACE_IMAGES_LEFT',
    });
    expect(await repo.listByUser(me.id)).toEqual([]);

    repo.removeImages = remove;
    await service.reset(me.id);
    expect(repo.files.size).toBe(0);
  });

  it('รีเซ็ตธรรมดาไม่ล้างความยินยอม ส่ง withdraw ถึงล้าง', async () => {
    const { service, repo, withdrawn } = setup();
    const me = student();
    repo.userIds.add(me.id);
    await service.reset(me.id);
    expect(withdrawn).toEqual([]);
    await service.reset(me.id, { withdraw: true });
    expect(withdrawn).toEqual([me.id]);
  });

  it.each(['not-a-uuid', randomUUID()])('ไม่มีผู้ใช้ %s ได้ 404 USER_NOT_FOUND', async (id) => {
    const { service } = setup();
    expect(await rejection(service.reset(id))).toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('EnrollmentService.savePose', () => {
  // ถ่ายท่านี้ให้ผ่าน (ตั้งมุมให้ตรงท่า)
  async function shoot(service: EnrollmentService, face: FakeFace, me: AppUser, pose: Pose) {
    face.next = { pose: ANGLE[pose] };
    return service.savePose(me, pose, jpeg());
  }

  // ทุกกรณีที่ไม่ผ่านต้องไม่มีแถวหรือไฟล์ใหม่
  async function expectNothingStored(repo: InMemoryEnrollmentRepo, me: AppUser, files: number) {
    expect(repo.files.size).toBe(files);
    expect((await repo.listByUser(me.id)).length).toBe(files);
  }

  it('ถ่ายหน้าตรงสำเร็จ', async () => {
    const { service, face, repo } = setup();
    const me = student();
    expect(await shoot(service, face, me, 'front')).toEqual({ done: ['front'], complete: false });
    expect(repo.files.size).toBe(1);
    const [path] = repo.files.keys();
    expect(path).toMatch(new RegExp(`^${me.id}/front-[0-9a-f-]{36}\\.jpg$`));
  });

  it('ครบ 5 ท่าแล้ว complete และส่งอีกได้ 409 ALREADY_ENROLLED', async () => {
    const { service, face, repo } = setup();
    const me = student();
    let status;
    for (const pose of POSES) status = await shoot(service, face, me, pose);
    expect(status).toEqual({ done: [...POSES], complete: true });

    expect(await rejection(shoot(service, face, me, 'left'))).toMatchObject({
      status: 409,
      code: 'ALREADY_ENROLLED',
    });
    expect(repo.files.size).toBe(5);
  });

  it('ถ่ายท่าเดิมซ้ำ แทนที่แถวเดิมและลบไฟล์เก่า', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    await storeRow(repo, me.id, 'left');

    await shoot(service, face, me, 'left');

    const rows = await repo.listByUser(me.id);
    expect(rows.filter((r) => r.pose === 'left')).toHaveLength(1);
    expect(repo.files.has(`${me.id}/left-old.jpg`)).toBe(false);
    expect(repo.files.size).toBe(2);
  });

  it('ไม่มีรหัสนักศึกษาได้ 403 NOT_A_STUDENT', async () => {
    const { service, face } = setup();
    const err = await rejection(service.savePose(student({ studentId: null }), 'front', jpeg()));
    expect(err).toMatchObject({ status: 403, code: 'NOT_A_STUDENT' });
    expect(face.calls).toBe(0);
  });

  it('ยังไม่ยินยอมได้ 403 CONSENT_REQUIRED', async () => {
    const { service, repo } = setup();
    const me = student({ pdpaConsentAt: null });
    expect(await rejection(service.savePose(me, 'front', jpeg()))).toMatchObject({
      status: 403,
      code: 'CONSENT_REQUIRED',
    });
    await expectNothingStored(repo, me, 0);
  });

  it('ชื่อท่าที่ไม่มีได้ 404', async () => {
    const { service } = setup();
    expect(await rejection(service.savePose(student(), 'side', jpeg()))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('ยังไม่มีหน้าตรงได้ 409 FRONT_FIRST', async () => {
    const { service, face, repo } = setup();
    const me = student();
    expect(await rejection(shoot(service, face, me, 'left'))).toMatchObject({
      status: 409,
      code: 'FRONT_FIRST',
    });
    await expectNothingStored(repo, me, 0);
  });

  it('ไม่แนบไฟล์ได้ 400 IMAGE_REQUIRED', async () => {
    const { service } = setup();
    expect(await rejection(service.savePose(student(), 'front', undefined))).toMatchObject({
      status: 400,
      code: 'IMAGE_REQUIRED',
    });
  });

  it.each(['image/heic', 'image/gif', 'application/pdf'])(
    'ไฟล์ %s ได้ 400 UNSUPPORTED_IMAGE',
    async (mimetype) => {
      const { service, face } = setup();
      const err = await rejection(service.savePose(student(), 'front', { ...jpeg(), mimetype }));
      expect(err).toMatchObject({ status: 400, code: 'UNSUPPORTED_IMAGE' });
      expect(face.calls).toBe(0);
    },
  );

  it('บอกว่าเป็น JPEG แต่เนื้อไฟล์ไม่ใช่ ได้ 400 UNSUPPORTED_IMAGE', async () => {
    const { service, face } = setup();
    const fake = { buffer: Buffer.from('GIF89a........'), mimetype: 'image/jpeg', size: 14 };
    const err = await rejection(service.savePose(student(), 'front', fake));
    expect(err).toMatchObject({ status: 400, code: 'UNSUPPORTED_IMAGE' });
    expect(face.calls).toBe(0);
  });

  it('PNG จริงผ่าน', async () => {
    const { service } = setup();
    const buffer = Buffer.alloc(100, 1);
    buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const status = await service.savePose(student(), 'front', {
      buffer,
      mimetype: 'image/png',
      size: 100,
    });
    expect(status.done).toEqual(['front']);
  });

  it('เปลี่ยนโมเดลแล้วถ่ายท่าอื่น ได้ 409 FRONT_FIRST และท่าเก่าถูกล้าง', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    await storeRow(repo, me.id, 'left');
    face.next = { pose: ANGLE.right, model: 'new_model' };

    expect(await rejection(service.savePose(me, 'right', jpeg()))).toMatchObject({
      status: 409,
      code: 'FRONT_FIRST',
    });
    expect(await repo.listByUser(me.id)).toEqual([]);
    expect(repo.files.size).toBe(0);
  });

  it('เปลี่ยนโมเดลแล้วถ่ายหน้าตรงใหม่ ผ่านโดยไม่เทียบกับท่าเก่า', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    await storeRow(repo, me.id, 'left');
    // เวกเตอร์คนละแบบกับของเก่า ถ้าเอาไปเทียบจะไม่ผ่าน
    face.next = { pose: ANGLE.front, model: 'new_model', embedding: [0, 1] };

    const status = await service.savePose(me, 'front', jpeg());

    expect(status).toEqual({ done: ['front'], complete: false });
    expect((await repo.listByUser(me.id)).map((r) => r.model)).toEqual(['new_model']);
  });

  it('ส่ง error ที่ผู้ใช้แก้ได้จาก face service ต่อตามเดิม', async () => {
    const { service, face, repo } = setup();
    const me = student();
    face.next = new AppError(422, 'MULTIPLE_FACES', 'มีหลายคนในรูป ถ่ายให้มีแค่คนเดียว');
    expect(await rejection(service.savePose(me, 'front', jpeg()))).toMatchObject({
      status: 422,
      code: 'MULTIPLE_FACES',
    });
    await expectNothingStored(repo, me, 0);
  });

  it('face service ไม่คืนมุมหน้าได้ 503', async () => {
    const { service, face } = setup();
    face.next = { pose: null };
    expect(await rejection(service.savePose(student(), 'front', jpeg()))).toMatchObject({
      status: 503,
      code: 'FACE_SERVICE_UNAVAILABLE',
    });
  });

  it('ท่าไม่ตรงได้ 422 WRONG_POSE พร้อมคำบอก', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    face.next = { pose: ANGLE.right };
    expect(await rejection(service.savePose(me, 'left', jpeg()))).toEqual({
      status: 422,
      code: 'WRONG_POSE',
      message: 'หันซ้ายอีกนิด',
    });
    await expectNothingStored(repo, me, 1);
  });

  it('คนละคนกับหน้าตรงได้ 422 NOT_SAME_PERSON', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    face.next = { pose: ANGLE.left, embedding: [0, 1] };
    expect(await rejection(service.savePose(me, 'left', jpeg()))).toMatchObject({
      status: 422,
      code: 'NOT_SAME_PERSON',
    });
    await expectNothingStored(repo, me, 1);
  });

  it('ถ่ายหน้าตรงใหม่ต้องเป็นคนเดียวกับท่าที่มีอยู่', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    await storeRow(repo, me.id, 'left');
    face.next = { pose: ANGLE.front, embedding: [0, 1] };
    expect(await rejection(service.savePose(me, 'front', jpeg()))).toMatchObject({
      code: 'NOT_SAME_PERSON',
    });
    expect(repo.files.has(`${me.id}/front-old.jpg`)).toBe(true);
  });

  it('บันทึกแถวไม่สำเร็จ ลบไฟล์ใหม่ทิ้ง ไฟล์เก่ายังอยู่ ได้ 503', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    repo.savePose = async () => {
      throw new AppError(503, 'DB_UNAVAILABLE', 'เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง');
    };
    expect(await rejection(shoot(service, face, me, 'front'))).toMatchObject({
      status: 503,
      code: 'DB_UNAVAILABLE',
    });
    expect([...repo.files.keys()]).toEqual([`${me.id}/front-old.jpg`]);
  });

  it('อัปโหลดไฟล์ไม่สำเร็จ ไม่บันทึกแถว', async () => {
    const { service, face, repo } = setup();
    const me = student();
    repo.uploadImage = async () => {
      throw new AppError(503, 'DB_UNAVAILABLE', 'เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง');
    };
    expect(await rejection(shoot(service, face, me, 'front'))).toMatchObject({ status: 503 });
    expect(await repo.listByUser(me.id)).toEqual([]);
  });

  it('ลบไฟล์เก่าไม่สำเร็จก็ยังนับว่าถ่ายผ่าน', async () => {
    const { service, face, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'front');
    repo.removeImages = async () => {
      throw new Error('storage down');
    };
    expect(await shoot(service, face, me, 'front')).toEqual({ done: ['front'], complete: false });
  });
});
